const { EndBehaviorType } = require('@discordjs/voice');
const { WebSocketServer } = require('ws');

// Discord / Opus decode: 48kHz stereo 16-bit PCM (must stay 48kHz for prism decoder)
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_SAMPLES = 960; // 20ms @ 48kHz
const TICK_MS = 20;

// Output to browser: downmix to mono + decimate 48→16kHz (factor-3 decimation)
// Bandwidth: 640 bytes/frame @ 50fps ≈ 32 KB/s per client  (was 3840 bytes, 192 KB/s)
const OUT_CHANNELS = 1;
const DOWNSAMPLE = 3; // 48000 / 3 = 16000 Hz
const OUT_FRAME_SAMPLES = FRAME_SAMPLES / DOWNSAMPLE; // 320 samples (20ms @ 16kHz)
const OUT_FRAME_BYTES = OUT_FRAME_SAMPLES * OUT_CHANNELS * 2; // 640 bytes

function createLiveVoiceStream() {
  let prism = null;
  try {
    prism = require('prism-media');
  } catch (err) {
    console.warn('[LIVE-STREAM] prism-media not available:', err.message);
  }

  const wss = new WebSocketServer({ noServer: true });

  // guildId -> { guildId, channelId, channelName, speakingSubs: Map, tickTimer, clients: Set }
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

  function mixTick(s) {
    // Mix incoming speakers into a 48kHz stereo int32 accumulator
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

    // Skip silence entirely — saves bandwidth and CPU when nobody is speaking
    if (!anyData) return;

    // Downmix stereo→mono + decimate 48kHz→16kHz with proper anti-aliasing.
    // For each output sample j: average ALL DOWNSAMPLE (3) consecutive stereo
    // pairs — this acts as a 3-tap moving-average low-pass filter that removes
    // frequencies above the 8kHz Nyquist of the 16kHz output before decimation.
    // Without this, frequencies 8kHz–24kHz alias back into the audible band and
    // produce the "metallic / unclear" artefacts reported on Render.
    //
    // Additionally apply soft-clip (tanh-like knee) BEFORE the final clamp so
    // that mixed multi-speaker peaks are rounded rather than hard-clipped.
    const outBuf = Buffer.alloc(OUT_FRAME_BYTES);
    for (let j = 0; j < OUT_FRAME_SAMPLES; j++) {
      const base = j * DOWNSAMPLE * CHANNELS;
      // Sum DOWNSAMPLE stereo pairs → mono (anti-alias + downmix in one pass)
      let acc = 0;
      for (let k = 0; k < DOWNSAMPLE; k++) {
        const i = base + k * CHANNELS;
        acc += (out[i] + out[i + 1]) >> 1; // average L+R for each pair
      }
      let sample = Math.round(acc / DOWNSAMPLE);
      // Soft-clip: reduce gain when signal is loud (keeps voice intelligible
      // even when multiple speakers are active simultaneously).
      if (sample > 24576) {
        sample = 24576 + Math.round((sample - 24576) * 0.25);
      } else if (sample < -24576) {
        sample = -24576 + Math.round((sample + 24576) * 0.25);
      }
      if (sample > 32767) sample = 32767;
      else if (sample < -32768) sample = -32768;
      outBuf.writeInt16LE(sample, j * 2);
    }
    broadcastFrame(s, outBuf);
  }

  function subscribeUser(s, receiver, userId) {
    if (s.speakingSubs.has(userId) || !prism) return;

    const audioStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Silence, duration: 150 },
    });
    const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: FRAME_SAMPLES });
    const sub = { stream: audioStream, decoder, queue: [] };
    s.speakingSubs.set(userId, sub);

    audioStream.pipe(decoder);

    decoder.on('data', (pcmChunk) => {
      sub.queue.push(pcmChunk);
      if (sub.queue.length > 25) sub.queue.shift(); // ~500ms cap, avoid runaway buffering
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

  function attach(connection, guildId, channelName, guildName) {
    const receiver = connection.receiver;
    const existing = streams.get(guildId);

    // DAVE renegotiation reuses the same VoiceConnection/receiver object.
    // Detect this case and skip the full tear-down/rebuild — just update
    // metadata and rebroadcast status so browser clients see the correct
    // channel name. This prevents accumulating a new speaking listener
    // (and new AudioReceiveStream subscriptions) on every renegotiation cycle.
    if (existing && existing.receiver === receiver) {
      existing.channelId = connection?.joinConfig?.channelId || null;
      existing.channelName = channelName || null;
      existing.guildName = guildName || null;
      broadcastStatusFor(existing);
      console.log(`[LIVE-STREAM] Re-attached (same connection) to guild ${guildId}${channelName ? ` (#${channelName})` : ''}`);
      return;
    }

    // New or replaced connection — harvest surviving browser WS clients so we
    // can migrate them and avoid an "Offline" flash during reconnects.
    const survivingClients = new Set();
    if (existing) {
      for (const ws of existing.clients) {
        if (ws.readyState === ws.OPEN) survivingClients.add(ws);
      }
    }

    // Tear down the old stream silently when there are migrated clients so
    // they never see a false Offline status during the handover.
    detach(guildId, { silent: survivingClients.size > 0 });

    const s = {
      guildId,
      guildName: guildName || null,
      channelId: connection?.joinConfig?.channelId || null,
      channelName: channelName || null,
      speakingSubs: new Map(),
      tickTimer: null,
      clients: survivingClients, // migrate surviving browser connections
      receiver,                  // stored so detach() can remove the speaking listener
      speakingListener: null,    // filled in below
    };
    streams.set(guildId, s);

    // Re-wire cleanup for migrated clients so they properly leave this stream.
    for (const ws of survivingClients) {
      ws.removeAllListeners('close');
      ws.removeAllListeners('error');
      const migratedCleanup = () => s.clients.delete(ws);
      ws.on('close', migratedCleanup);
      ws.on('error', migratedCleanup);
    }

    // Store the listener so detach() can remove it precisely — prevents
    // listener accumulation when the connection object is replaced.
    const speakingListener = (userId) => {
      try { subscribeUser(s, receiver, userId); } catch (err) {
        console.warn('[LIVE-STREAM] subscribe failed:', err.message);
      }
    };
    s.speakingListener = speakingListener;
    receiver.speaking.on('start', speakingListener);

    s.tickTimer = setInterval(() => mixTick(s), TICK_MS);
    broadcastStatusFor(s);
    console.log(`[LIVE-STREAM] Attached to guild ${guildId}${channelName ? ` (#${channelName})` : ''}`);
  }

  function detach(guildId, { silent = false } = {}) {
    const s = streams.get(guildId);
    if (!s) return;

    if (s.tickTimer) clearInterval(s.tickTimer);

    // Remove the speaking listener we registered — prevents accumulation across
    // DAVE renegotiations where a new connection replaces the old one.
    if (s.receiver && s.speakingListener) {
      try { s.receiver.speaking.off('start', s.speakingListener); } catch { /* ignore */ }
    }

    for (const sub of s.speakingSubs.values()) {
      try { sub.stream.destroy(); } catch { /* ignore */ }
      try { sub.decoder.destroy(); } catch { /* ignore */ }
    }

    // Notify listeners the stream is gone — skip when called from attach()
    // so migrated clients never see an Offline flash during DAVE renegotiation.
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

  function detachIfGuild(guildId) {
    detach(guildId);
  }

  wss.on('connection', (ws, req) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const requestedGuildId = requestUrl.searchParams.get('guildId');

    // Pick the requested guild's stream, or fall back to the first active one.
    let s = requestedGuildId ? streams.get(requestedGuildId) : null;
    if (!s && !requestedGuildId) {
      s = streams.values().next().value || null;
    }

    // Keepalive ping every 25s — prevents Render's proxy from dropping
    // idle WebSocket connections when nobody is speaking (no binary frames flowing).
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
