const { EndBehaviorType } = require('@discordjs/voice');
const { WebSocketServer } = require('ws');

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_SAMPLES = 960; // 20ms @ 48kHz
const FRAME_BYTES = FRAME_SAMPLES * CHANNELS * 2; // int16
const TICK_MS = 20;

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

    if (!anyData && s.clients.size === 0) {
      return; // nobody listening and nothing to send — skip work
    }

    const outBuf = Buffer.alloc(FRAME_BYTES);
    for (let i = 0; i < out.length; i++) {
      let sample = out[i];
      if (sample > 32767) sample = 32767;
      else if (sample < -32768) sample = -32768;
      outBuf.writeInt16LE(sample, i * 2);
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
    // Replace any existing stream for this same guild (e.g. rejoin).
    detach(guildId);

    const s = {
      guildId,
      guildName: guildName || null,
      channelId: connection?.joinConfig?.channelId || null,
      channelName: channelName || null,
      speakingSubs: new Map(),
      tickTimer: null,
      clients: new Set(),
    };
    streams.set(guildId, s);

    const receiver = connection.receiver;
    receiver.speaking.on('start', (userId) => {
      try { subscribeUser(s, receiver, userId); } catch (err) {
        console.warn('[LIVE-STREAM] subscribe failed:', err.message);
      }
    });

    s.tickTimer = setInterval(() => mixTick(s), TICK_MS);
    broadcastStatusFor(s);
    console.log(`[LIVE-STREAM] Attached to guild ${guildId}${channelName ? ` (#${channelName})` : ''}`);
  }

  function detach(guildId) {
    const s = streams.get(guildId);
    if (!s) return;

    if (s.tickTimer) clearInterval(s.tickTimer);
    for (const sub of s.speakingSubs.values()) {
      try { sub.stream.destroy(); } catch { /* ignore */ }
      try { sub.decoder.destroy(); } catch { /* ignore */ }
    }

    // Tell any listeners on this specific guild's stream that it's gone.
    const payload = JSON.stringify({ type: 'status', active: false, guildId, channelId: null, channelName: null });
    for (const ws of s.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch { /* ignore */ }
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

    if (s) {
      s.clients.add(ws);
      ws.send(JSON.stringify({
        type: 'status',
        active: true,
        guildId: s.guildId,
        channelId: s.channelId,
        channelName: s.channelName,
      }));
      ws.on('close', () => s.clients.delete(ws));
      ws.on('error', () => s.clients.delete(ws));
    } else {
      ws.send(JSON.stringify({ type: 'status', active: false, guildId: requestedGuildId || null, channelName: null }));
      ws.on('close', () => {});
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
