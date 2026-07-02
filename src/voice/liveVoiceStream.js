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
  const clients = new Set();

  let activeGuildId = null;
  let activeChannelId = null;
  let activeChannelName = null;
  let speakingSubs = new Map(); // userId -> { stream, decoder, queue: Buffer[] }
  let tickTimer = null;

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({
      type: 'status',
      active: Boolean(activeGuildId),
      channelName: activeChannelName,
    }));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  function broadcastStatus() {
    const payload = JSON.stringify({
      type: 'status',
      active: Boolean(activeGuildId),
      channelName: activeChannelName,
    });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch { /* ignore */ }
      }
    }
  }

  function broadcastFrame(buffer) {
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(buffer, { binary: true }); } catch { /* ignore */ }
      }
    }
  }

  function mixTick() {
    const out = new Int32Array(FRAME_SAMPLES * CHANNELS);
    let anyData = false;

    for (const sub of speakingSubs.values()) {
      if (sub.queue.length === 0) continue;
      const chunk = sub.queue.shift();
      anyData = true;
      const samplesToRead = Math.min(FRAME_SAMPLES * CHANNELS, Math.floor(chunk.length / 2));
      for (let i = 0; i < samplesToRead; i++) {
        out[i] += chunk.readInt16LE(i * 2);
      }
    }

    if (!anyData && clients.size === 0) {
      return; // nobody listening and nothing to send — skip work
    }

    const outBuf = Buffer.alloc(FRAME_BYTES);
    for (let i = 0; i < out.length; i++) {
      let sample = out[i];
      if (sample > 32767) sample = 32767;
      else if (sample < -32768) sample = -32768;
      outBuf.writeInt16LE(sample, i * 2);
    }
    broadcastFrame(outBuf);
  }

  function subscribeUser(receiver, userId) {
    if (speakingSubs.has(userId) || !prism) return;

    const audioStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Silence, duration: 150 },
    });
    const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: FRAME_SAMPLES });
    const sub = { stream: audioStream, decoder, queue: [] };
    speakingSubs.set(userId, sub);

    audioStream.pipe(decoder);

    decoder.on('data', (pcmChunk) => {
      sub.queue.push(pcmChunk);
      if (sub.queue.length > 25) sub.queue.shift(); // ~500ms cap, avoid runaway buffering
    });

    const cleanup = () => {
      speakingSubs.delete(userId);
      try { audioStream.destroy(); } catch { /* ignore */ }
      try { decoder.destroy(); } catch { /* ignore */ }
    };

    audioStream.on('end', cleanup);
    audioStream.on('error', cleanup);
    decoder.on('error', cleanup);
  }

  function attach(connection, guildId, channelName) {
    detach();

    activeGuildId = guildId;
    activeChannelId = connection?.joinConfig?.channelId || null;
    activeChannelName = channelName || null;

    const receiver = connection.receiver;
    receiver.speaking.on('start', (userId) => {
      try { subscribeUser(receiver, userId); } catch (err) {
        console.warn('[LIVE-STREAM] subscribe failed:', err.message);
      }
    });

    tickTimer = setInterval(mixTick, TICK_MS);
    broadcastStatus();
    console.log(`[LIVE-STREAM] Attached to guild ${guildId}${channelName ? ` (#${channelName})` : ''}`);
  }

  function detach() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    for (const sub of speakingSubs.values()) {
      try { sub.stream.destroy(); } catch { /* ignore */ }
      try { sub.decoder.destroy(); } catch { /* ignore */ }
    }
    speakingSubs = new Map();
    if (activeGuildId) {
      console.log(`[LIVE-STREAM] Detached from guild ${activeGuildId}`);
    }
    activeGuildId = null;
    activeChannelId = null;
    activeChannelName = null;
    broadcastStatus();
  }

  function detachIfGuild(guildId) {
    if (activeGuildId === guildId) detach();
  }

  function getStatus() {
    return {
      active: Boolean(activeGuildId),
      guildId: activeGuildId,
      channelId: activeChannelId,
      channelName: activeChannelName,
      listeners: clients.size,
    };
  }

  function handleUpgrade(req, socket, head) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }

  return { attach, detach, detachIfGuild, getStatus, handleUpgrade };
}

module.exports = { createLiveVoiceStream };
