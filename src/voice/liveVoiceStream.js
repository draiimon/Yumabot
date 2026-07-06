const { EndBehaviorType } = require('@discordjs/voice');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

// Discord / Opus decode: 48kHz stereo 16-bit PCM (must stay 48kHz for prism decoder)
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_SAMPLES = 960; // 20ms @ 48kHz

// Output to FFmpeg: downmix stereo→mono
const OUT_CHANNELS = 1;
const OUT_FRAME_SAMPLES = FRAME_SAMPLES;
const OUT_FRAME_BYTES = OUT_FRAME_SAMPLES * OUT_CHANNELS * 2; // 1920 bytes

// WebM Cluster element ID — marks boundary between init segment and media data
const CLUSTER_ID = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);

const TICK_MS = 20;

function createLiveVoiceStream() {
  let prism = null;
  try {
    prism = require('prism-media');
  } catch (err) {
    console.warn('[LIVE-STREAM] prism-media not available:', err.message);
  }

  const wss = new WebSocketServer({ noServer: true });

  // guildId -> stream state object
  const streams = new Map();

  function listStatus() {
    return Array.from(streams.values()).map((s) => ({
      guildId: s.guildId,
      guildName: s.guildName,
      channelId: s.channelId,
      channelName: s.channelName,
      listeners: s.clients.size,
    }));
  }

  function getStatus(guildId) {
    if (guildId) {
      const s = streams.get(guildId);
      return {
        active: Boolean(s),
        guildId: s ? s.guildId : null,
        guildName: s ? s.guildName : null,
        channelId: s ? s.channelId : null,
        channelName: s ? s.channelName : null,
        listeners: s ? s.clients.size : 0,
        streams: listStatus(),
      };
    }
    const all = listStatus();
    const first = all[0] || null;
    return {
      active: Boolean(first),
      guildId: first ? first.guildId : null,
      guildName: first ? first.guildName : null,
      channelId: first ? first.channelId : null,
      channelName: first ? first.channelName : null,
      listeners: first ? first.listeners : 0,
      streams: all,
    };
  }

  function broadcastStatusFor(s) {
    const payload = JSON.stringify({
      type: 'status',
      active: true,
      guildId: s.guildId,
      guildName: s.guildName,
      channelId: s.channelId,
      channelName: s.channelName,
    });
    for (const ws of s.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch { /* ignore */ }
      }
    }
  }

  function broadcastFrame(s, buffer) {
    for (const ws of s.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(buffer, { binary: true }); } catch { /* ignore */ }
      }
    }
  }

  // ─── FFmpeg subprocess ────────────────────────────────────────────────────
  // Reads raw PCM (s16le, 48 kHz, mono) from stdin.
  // Outputs WebM Opus to stdout; chunks forwarded to browser via MSE.
  //
  // On restart (crash recovery), only NEW clients get the new init segment —
  // existing clients receive a "stream-reset" control message so they can
  // tear down and recreate their SourceBuffer before we start feeding them
  // chunks from the new encoder epoch.
  function killFfmpeg(ff) {
    if (!ff || ff.killed) return;
    try { ff.stdin.end(); } catch { /* ignore */ }
    const t = setTimeout(() => {
      if (!ff.killed) {
        try { ff.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }, 800);
    ff.once('exit', () => clearTimeout(t));
    try { ff.kill('SIGTERM'); } catch { /* ignore */ }
  }

  function spawnFfmpeg(s, isRespawn) {
    const ff = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-f', 's16le',
      '-ar', String(SAMPLE_RATE),
      '-ac', String(OUT_CHANNELS),
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-application', 'audio',      // full-range music mode, not voip
      '-frame_duration', '20',      // 20ms Opus frames (native Discord size)
      '-cluster_time_limit', '100', // new WebM Cluster every 100ms (MSE chunk boundary)
      '-f', 'webm',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    // Stdin flow-control: pause writes when the pipe is full; resume on drain.
    // This bounds memory and prevents unbounded Node buffering under load.
    ff.stdin.on('drain', () => { s.ffmpegPaused = false; });
    s.ffmpegPaused = false;

    // Reset init-segment state for this encoder epoch
    s.initBuf = Buffer.alloc(0);
    s.initSegment = null;
    // Bump epoch so existing clients know to reset their SourceBuffer
    s.epoch = (s.epoch || 0) + 1;
    const myEpoch = s.epoch;

    if (isRespawn) {
      // Tell existing clients: close your SourceBuffer, new stream epoch starting.
      const resetMsg = JSON.stringify({ type: 'stream-reset' });
      for (const ws of s.clients) {
        if (ws.readyState === ws.OPEN) {
          try { ws.send(resetMsg); } catch { /* ignore */ }
        }
      }
    }

    ff.stdout.on('data', (chunk) => {
      // If the stream was replaced (s.epoch changed), stop processing stale output
      if (s.epoch !== myEpoch) return;

      if (!s.initSegment) {
        s.initBuf = Buffer.concat([s.initBuf, chunk]);
        const pos = s.initBuf.indexOf(CLUSTER_ID);
        if (pos !== -1) {
          s.initSegment = s.initBuf.slice(0, pos);
          const remaining = s.initBuf.slice(pos);
          s.initBuf = null;
          // Send init + first media cluster to clients that joined before FFmpeg
          // was ready (they got the status message but no audio yet).
          // Clients that joined mid-stream receive initSegment separately on connect.
          if (remaining.length > 0) {
            broadcastFrame(s, Buffer.concat([s.initSegment, remaining]));
          }
        }
        return;
      }
      broadcastFrame(s, chunk);
    });

    ff.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.error('[LIVE-STREAM] FFmpeg:', msg);
    });

    ff.on('exit', (code, signal) => {
      if (!s.active || s.ffmpeg !== ff) return; // already replaced / detached
      console.warn(`[LIVE-STREAM] FFmpeg exited (code=${code} signal=${signal}), respawning…`);
      s.ffmpeg = null;
      setTimeout(() => { if (s.active) spawnFfmpeg(s, true); }, 1000);
    });

    s.ffmpeg = ff;
  }

  // ─── PCM mixer tick ───────────────────────────────────────────────────────
  function mixTick(s) {
    const out = new Int32Array(FRAME_SAMPLES * CHANNELS);
    let anyData = false;

    for (const sub of s.speakingSubs.values()) {
      if (sub.queue.length === 0) continue;
      const chunk = sub.queue.shift();
      anyData = true;
      const samplesToRead = Math.min(FRAME_SAMPLES * CHANNELS, Math.floor(chunk.length / 2));
      for (let i = 0; i < samplesToRead; i++) {
        out[i] += chunk.readInt16LE(i * 2);
      }
    }

    // Build mono output (silence = zeroed buffer, which FFmpeg encodes as silence)
    const outBuf = Buffer.alloc(OUT_FRAME_BYTES);
    if (anyData) {
      for (let j = 0; j < OUT_FRAME_SAMPLES; j++) {
        const idx = j * CHANNELS;
        let sample = (out[idx] + out[idx + 1]) >> 1;
        if (sample > 24576)  sample = 24576  + Math.round((sample - 24576)  * 0.25);
        else if (sample < -24576) sample = -24576 + Math.round((sample + 24576) * 0.25);
        if (sample > 32767)  sample = 32767;
        else if (sample < -32768) sample = -32768;
        outBuf.writeInt16LE(sample, j * 2);
      }
    }

    // Write to FFmpeg stdin with backpressure: if the pipe buffer is full,
    // set the paused flag and drop this frame rather than buffering unboundedly.
    if (s.ffmpeg && !s.ffmpegPaused) {
      const ok = s.ffmpeg.stdin.writable
        ? (() => { try { return s.ffmpeg.stdin.write(outBuf); } catch { return false; } })()
        : false;
      if (!ok) s.ffmpegPaused = true; // wait for 'drain' event
    }
  }

  // ─── User subscription ────────────────────────────────────────────────────
  function subscribeUser(s, receiver, userId) {
    if (s.speakingSubs.has(userId) || !prism) return;

    const audioStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });
    const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: FRAME_SAMPLES });
    const sub = { stream: audioStream, decoder, queue: [] };
    s.speakingSubs.set(userId, sub);

    audioStream.pipe(decoder);

    decoder.on('data', (pcmChunk) => {
      sub.queue.push(pcmChunk);
      if (sub.queue.length > 25) sub.queue.shift(); // 500ms cap, drop oldest
    });

    const cleanup = () => {
      s.speakingSubs.delete(userId);
      try { audioStream.destroy(); } catch { /* ignore */ }
      try { decoder.destroy(); } catch { /* ignore */ }
    };

    audioStream.on('end', cleanup);
    audioStream.on('error', cleanup);
    decoder.on('error', cleanup);
  }

  function subscribeAllInChannel(s, receiver) {
    if (!prism) return;
    try {
      const ssrcMap = receiver.ssrcMap;
      if (!ssrcMap) return;
      for (const [, { userId }] of ssrcMap) {
        if (userId && !s.speakingSubs.has(userId)) {
          try { subscribeUser(s, receiver, userId); } catch { /* ignore */ }
        }
      }
    } catch { /* ssrcMap may not exist in all library versions */ }
  }

  // ─── Attach / Detach ─────────────────────────────────────────────────────
  function attach(connection, guildId, channelName, guildName) {
    const receiver = connection.receiver;
    const existing = streams.get(guildId);

    // DAVE renegotiation: same connection object — skip full rebuild
    if (existing && existing.receiver === receiver) {
      existing.channelId = connection?.joinConfig?.channelId || null;
      existing.channelName = channelName || null;
      existing.guildName = guildName || null;
      broadcastStatusFor(existing);
      console.log(`[LIVE-STREAM] Re-attached (same connection) to guild ${guildId}${channelName ? ` (#${channelName})` : ''}`);
      return;
    }

    const survivingClients = new Set();
    if (existing) {
      for (const ws of existing.clients) {
        if (ws.readyState === ws.OPEN) survivingClients.add(ws);
      }
    }
    detach(guildId, { silent: survivingClients.size > 0 });

    const s = {
      guildId,
      guildName: guildName || null,
      channelId: connection?.joinConfig?.channelId || null,
      channelName: channelName || null,
      speakingSubs: new Map(),
      tickTimer: null,
      scanTimer: null,
      clients: survivingClients,
      receiver,
      speakingListener: null,
      active: true,
      ffmpeg: null,
      ffmpegPaused: false,
      initSegment: null,
      initBuf: null,
      epoch: 0,
    };
    streams.set(guildId, s);

    for (const ws of survivingClients) {
      ws.removeAllListeners('close');
      ws.removeAllListeners('error');
      const cleanup = () => s.clients.delete(ws);
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    }

    const speakingListener = (userId) => {
      try { subscribeUser(s, receiver, userId); } catch (err) {
        console.warn('[LIVE-STREAM] subscribe failed:', err.message);
      }
    };
    s.speakingListener = speakingListener;
    receiver.speaking.on('start', speakingListener);

    subscribeAllInChannel(s, receiver);

    // Periodic re-scan for music bots that start playing after attach
    s.scanTimer = setInterval(() => subscribeAllInChannel(s, receiver), 3000);

    // Spawn FFmpeg (not a respawn — first time)
    spawnFfmpeg(s, false);

    // Self-correcting tick loop: feeds PCM to FFmpeg at a steady 20ms cadence
    (function startTick() {
      let nextExpected = Date.now() + TICK_MS;

      function tick() {
        if (!s.active) return;

        const now = Date.now();
        const lag = now - nextExpected;

        if (lag > 500) {
          // Long stall (GC pause / suspend) — reset clock, avoid burst
          nextExpected = now + TICK_MS;
          mixTick(s);
        } else {
          const behind = Math.max(0, Math.floor(lag / TICK_MS));
          const framesToSend = Math.min(1 + behind, 5);
          for (let i = 0; i < framesToSend; i++) mixTick(s);
          nextExpected += framesToSend * TICK_MS;
        }

        s.tickTimer = setTimeout(tick, Math.max(0, nextExpected - Date.now()));
      }

      s.tickTimer = setTimeout(tick, TICK_MS);
    })();

    broadcastStatusFor(s);
    console.log(`[LIVE-STREAM] Attached to guild ${guildId}${channelName ? ` (#${channelName})` : ''}`);
  }

  function detach(guildId, { silent = false } = {}) {
    const s = streams.get(guildId);
    if (!s) return;

    s.active = false;
    if (s.tickTimer) clearTimeout(s.tickTimer);
    if (s.scanTimer) clearInterval(s.scanTimer);

    if (s.receiver && s.speakingListener) {
      try { s.receiver.speaking.off('start', s.speakingListener); } catch { /* ignore */ }
    }

    for (const sub of s.speakingSubs.values()) {
      try { sub.stream.destroy(); } catch { /* ignore */ }
      try { sub.decoder.destroy(); } catch { /* ignore */ }
    }

    // Retain local reference so the delayed kill still works after s.ffmpeg is nulled
    const ff = s.ffmpeg;
    s.ffmpeg = null;
    if (ff) killFfmpeg(ff);

    if (!silent) {
      const payload = JSON.stringify({ type: 'status', active: false, guildId, channelId: null, channelName: null });
      for (const ws of s.clients) {
        if (ws.readyState === ws.OPEN) {
          try { ws.send(payload); } catch { /* ignore */ }
        }
      }
    }

    streams.delete(guildId);
    console.log(`[LIVE-STREAM] Detached from guild ${guildId}`);
  }

  function detachIfGuild(guildId) { detach(guildId); }

  // ─── WebSocket server ─────────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const requestedGuildId = requestUrl.searchParams.get('guildId');

    let s = requestedGuildId ? streams.get(requestedGuildId) : null;
    if (!s && !requestedGuildId) s = streams.values().next().value || null;

    const pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        try { ws.ping(); } catch { /* ignore */ }
      } else {
        clearInterval(pingTimer);
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(pingTimer);
      if (s) s.clients.delete(ws);
    };

    if (s) {
      s.clients.add(ws);

      ws.send(JSON.stringify({
        type: 'status',
        active: true,
        guildId: s.guildId,
        channelId: s.channelId,
        channelName: s.channelName,
      }));

      // Send cached WebM init segment so the client can decode from the start
      if (s.initSegment && ws.readyState === ws.OPEN) {
        try { ws.send(s.initSegment, { binary: true }); } catch { /* ignore */ }
      }

      ws.on('close', cleanup);
      ws.on('error', cleanup);
    } else {
      ws.send(JSON.stringify({ type: 'status', active: false, guildId: requestedGuildId || null, channelName: null }));
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    }
  });

  function handleUpgrade(req, socket, head) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }

  return { attach, detach, detachIfGuild, getStatus, listStatus, handleUpgrade };
}

module.exports = { createLiveVoiceStream };
