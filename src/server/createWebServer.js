const http = require('node:http');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function buildHealthPayload({ runtimeState, client, getDiagnostics }) {
  const memoryUsage = process.memoryUsage();
  const diagnostics = typeof getDiagnostics === 'function' ? getDiagnostics() : {};

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    service: runtimeState.service,
    discord: {
      ready: typeof client.isReady === 'function' ? client.isReady() : false,
      ping: Number.isFinite(client.ws?.ping) ? client.ws.ping : null,
      guilds: client.guilds?.cache?.size ?? 0,
      users: client.users?.cache?.size ?? 0,
      ...runtimeState.discord
    },
    database: runtimeState.database,
    voice: runtimeState.voice,
    keepAlive: runtimeState.keepAlive,
    process: runtimeState.process,
    memory: {
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
    },
    diagnostics
  };
}

function buildListenPageHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Yuma — Listen Live</title>
    <style>
      :root { color-scheme: dark; --bg:#0d1117; --panel:rgba(255,255,255,0.06); --text:#f4f7fb; --muted:#9fb0c3; --accent:#ff6b8a; --ok:#5ee6a8; --bad:#ff6b6b; }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100vh; font-family:"Segoe UI",sans-serif; background:radial-gradient(circle at top, rgba(255,107,138,0.32), transparent 40%), linear-gradient(160deg,#081018 0%,#0d1117 48%,#151a24 100%); color:var(--text); display:grid; place-items:center; padding:24px; }
      main { width:min(560px,100%); background:var(--panel); border:1px solid rgba(255,255,255,0.08); border-radius:24px; padding:28px; backdrop-filter:blur(14px); box-shadow:0 28px 80px rgba(0,0,0,0.35); text-align:center; }
      h1 { margin:0 0 8px; font-size:clamp(1.6rem,4vw,2.2rem); }
      p { margin:8px 0 0; color:var(--muted); }
      .status { margin:20px 0; display:inline-flex; align-items:center; gap:10px; padding:10px 14px; border-radius:999px; background:rgba(94,230,168,0.12); color:var(--ok); font-weight:700; }
      .status.off { background:rgba(255,107,107,0.12); color:var(--bad); }
      button { margin-top:18px; padding:14px 28px; font-size:1rem; font-weight:700; border:none; border-radius:999px; background:var(--accent); color:#1a0a10; cursor:pointer; }
      button:disabled { opacity:0.5; cursor:not-allowed; }
      .dot { width:8px; height:8px; border-radius:50%; background:currentColor; display:inline-block; }
      select { margin-top:14px; padding:10px 14px; border-radius:12px; background:#111823; color:var(--text); border:1px solid rgba(255,255,255,0.12); font-size:0.95rem; width:100%; }
      label { display:block; margin-top:16px; color:var(--muted); font-size:0.85rem; text-align:left; }
    </style>
  </head>
  <body>
    <main>
      <h1>🎧 Yuma — Listen Live</h1>
      <p id="channelInfo">Fetching voice channel status...</p>
      <div class="status off" id="statusPill"><span class="dot"></span><span id="statusText">Offline</span></div>
      <label for="channelSelect" id="channelSelectLabel" style="display:none;">Select channel:</label>
      <select id="channelSelect" style="display:none;"></select>
      <br>
      <button id="listenBtn" disabled>▶ Listen Live</button>
    </main>
    <script>
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const statusPill = document.getElementById('statusPill');
      const statusText = document.getElementById('statusText');
      const channelInfo = document.getElementById('channelInfo');
      const listenBtn = document.getElementById('listenBtn');
      const channelSelect = document.getElementById('channelSelect');
      const channelSelectLabel = document.getElementById('channelSelectLabel');

      const SAMPLE_RATE = 16000; // server sends 16kHz mono (downsampled from 48kHz stereo)
      const CHANNELS = 1;
      // Buffer ahead by 250ms — large enough to absorb Render's variable
      // latency (jitter spikes) without causing audible gaps/stuttering.
      const BUFFER_AHEAD_SEC = 0.25;

      let audioCtx = null;
      let audioChainInput = null; // first node in the processing chain
      let nextStartTime = 0;
      let listening = false;
      let ws = null;
      let currentGuildId = null;
      let knownStreams = [];
      let streamWasOffline = false;
      let reconnectTimer = null;
      let reconnectDelay = 1000; // ms, doubles on each failure (exp back-off)
      let manuallyDisconnected = false;

      function setStatus(active, channelName, extra) {
        statusPill.classList.toggle('off', !active);
        statusText.textContent = extra || (active ? 'Live' : 'Offline');
        channelInfo.textContent = active
          ? ('Naka-connect ang bot sa: ' + (channelName || 'voice channel'))
          : 'Wala pang bot sa voice channel ngayon.';
        listenBtn.disabled = !active && extra !== 'Reconnecting…';
      }

      // Schedule a WebSocket reconnect with exponential back-off.
      // Skipped if the user manually stopped listening.
      function scheduleReconnect(guildId) {
        if (manuallyDisconnected) return;
        if (reconnectTimer) return; // already scheduled
        setStatus(false, null, 'Reconnecting…');
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect(guildId || currentGuildId, { isReconnect: true });
        }, reconnectDelay);
      }

      async function refreshStreamList() {
        try {
          const res = await fetch('/voice-status');
          const data = await res.json();
          knownStreams = data.streams || [];
          if (knownStreams.length > 0) {
            channelSelect.style.display = 'block';
            channelSelectLabel.style.display = 'block';
            const prevValue = channelSelect.value;
            channelSelect.innerHTML = knownStreams
              .map((s) => {
                const label = (s.guildName ? s.guildName + ' — ' : '') + '#' + (s.channelName || s.guildId);
                return '<option value="' + s.guildId + '">' + label + '</option>';
              })
              .join('');
            if (prevValue && knownStreams.some((s) => s.guildId === prevValue)) {
              channelSelect.value = prevValue;
            }
          } else {
            channelSelect.style.display = 'none';
            channelSelectLabel.style.display = 'none';
          }
          if (!currentGuildId && knownStreams.length > 0) {
            connect(knownStreams[0].guildId);
          } else if (currentGuildId && streamWasOffline && knownStreams.length > 0) {
            const target = knownStreams.find((s) => s.guildId === currentGuildId) || knownStreams[0];
            streamWasOffline = false;
            connect(target.guildId);
          } else if (knownStreams.length === 0) {
            setStatus(false, null);
          }
        } catch {
          // ignore — poll will retry
        }
      }

      function connect(guildId, { isReconnect = false } = {}) {
        // Close existing socket cleanly without triggering our reconnect handler.
        if (ws) {
          ws._noReconnect = true;
          try { ws.close(); } catch {}
          ws = null;
        }
        if (!isReconnect) {
          // Fresh connect resets back-off.
          reconnectDelay = 1000;
        }
        currentGuildId = guildId || null;
        const qs = currentGuildId ? ('?guildId=' + encodeURIComponent(currentGuildId)) : '';
        const socket = new WebSocket(proto + '//' + location.host + '/voice-stream' + qs);
        socket.binaryType = 'arraybuffer';
        ws = socket;

        socket.onopen = () => {
          // Successful (re-)connect — reset back-off delay.
          reconnectDelay = 1000;
        };

        socket.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.type === 'status') {
                setStatus(msg.active, msg.channelName);
                streamWasOffline = !msg.active;
              }
            } catch {}
            return;
          }
          if (!listening || !audioCtx) return;

          const pcm = new Int16Array(ev.data);
          const frames = pcm.length / CHANNELS;
          const buffer = audioCtx.createBuffer(CHANNELS, frames, SAMPLE_RATE);
          for (let ch = 0; ch < CHANNELS; ch++) {
            const channelData = buffer.getChannelData(ch);
            for (let i = 0; i < frames; i++) {
              channelData[i] = pcm[i * CHANNELS + ch] / 32768;
            }
          }

          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(audioChainInput || audioCtx.destination);

          const now = audioCtx.currentTime;
          // If playback has fallen behind (e.g. after a gap), reset the
          // schedule to BUFFER_AHEAD_SEC from now to re-sync cleanly.
          if (nextStartTime < now + 0.05) {
            nextStartTime = now + BUFFER_AHEAD_SEC;
          }
          source.start(nextStartTime);
          nextStartTime += frames / SAMPLE_RATE;
        };

        // Auto-reconnect when Render drops the WebSocket (network hiccup,
        // 55-second idle timeout gap, container restart, etc.).
        socket.onclose = (ev) => {
          if (socket._noReconnect || manuallyDisconnected) return;
          console.warn('[listen] WS closed (code=' + ev.code + '), scheduling reconnect in ' + reconnectDelay + 'ms');
          scheduleReconnect(currentGuildId);
        };

        socket.onerror = () => {
          if (socket._noReconnect || manuallyDisconnected) return;
          scheduleReconnect(currentGuildId);
        };
      }

      channelSelect.addEventListener('change', () => {
        manuallyDisconnected = false;
        connect(channelSelect.value);
      });

      listenBtn.addEventListener('click', async () => {
        if (!listening) {
          manuallyDisconnected = false;
          audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });

          // ── Audio processing chain (browser-side, zero server CPU cost) ──
          //
          // source → [highpass] → [presence EQ] → [compressor] → [gain] → out
          //
          // 1. High-pass @ 100 Hz  — removes low rumble / mic handling noise
          // 2. Peaking EQ @ 2 kHz +5 dB — boosts the speech presence band so
          //    voices cut through clearly (Q=1.2 = gentle, musical shape)
          // 3. DynamicsCompressor — auto-levels quiet and loud speakers so
          //    nobody sounds muffled or distorted; standard "voice chat" settings
          // 4. Output gain x1.1 — recover headroom lost in compression

          const hpf = audioCtx.createBiquadFilter();
          hpf.type = 'highpass';
          hpf.frequency.value = 100;
          hpf.Q.value = 0.7;

          const presence = audioCtx.createBiquadFilter();
          presence.type = 'peaking';
          presence.frequency.value = 2000;
          presence.gain.value = 5;
          presence.Q.value = 1.2;

          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -24;  // start compressing at -24 dBFS
          compressor.knee.value = 10;         // soft knee for natural feel
          compressor.ratio.value = 4;         // 4:1 ratio — good for voice
          compressor.attack.value = 0.003;    // 3 ms attack (catches peaks fast)
          compressor.release.value = 0.25;    // 250 ms release (natural breath)

          const outputGain = audioCtx.createGain();
          outputGain.gain.value = 1.1;

          hpf.connect(presence);
          presence.connect(compressor);
          compressor.connect(outputGain);
          outputGain.connect(audioCtx.destination);

          audioChainInput = hpf;
          nextStartTime = audioCtx.currentTime + BUFFER_AHEAD_SEC;
          listening = true;
          listenBtn.textContent = '⏸ Stop';
          // Resume WebSocket if it was closed by a previous Stop.
          // Without this, pressing Listen again after Stop would never reconnect
          // because manuallyDisconnected blocked the auto-reconnect path.
          if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            const targetGuild = currentGuildId || (knownStreams[0] && knownStreams[0].guildId) || null;
            if (targetGuild) connect(targetGuild);
          }
        } else {
          manuallyDisconnected = true;
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          listening = false;
          nextStartTime = 0;
          if (ws) { ws._noReconnect = true; try { ws.close(); } catch {} ws = null; }
          if (audioCtx) { try { await audioCtx.close(); } catch {} audioCtx = null; audioChainInput = null; }
          listenBtn.textContent = '▶ Listen Live';
        }
      });

      refreshStreamList();
      setInterval(refreshStreamList, 5000);
    </script>
  </body>
</html>`;
}

function createWebServer({ config, runtimeState, client, getDiagnostics, liveVoiceStream, onJoinChannel }) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (requestUrl.pathname === '/') {
      const discordReady = typeof client.isReady === 'function' ? client.isReady() : false;
      sendHtml(
        res,
        200,
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Yuma Runtime</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1117;
        --panel: rgba(255, 255, 255, 0.06);
        --text: #f4f7fb;
        --muted: #9fb0c3;
        --accent: #ff6b8a;
        --ok: #5ee6a8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(255, 107, 138, 0.32), transparent 40%),
          linear-gradient(160deg, #081018 0%, #0d1117 48%, #151a24 100%);
        color: var(--text);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(720px, 100%);
        background: var(--panel);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        padding: 28px;
        backdrop-filter: blur(14px);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
      }
      h1 { margin: 0 0 8px; font-size: clamp(2rem, 4vw, 3rem); }
      p { margin: 0; color: var(--muted); }
      .status {
        margin: 22px 0 18px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(94, 230, 168, 0.12);
        color: var(--ok);
        font-weight: 700;
      }
      ul {
        margin: 24px 0 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.6;
      }
      code { color: var(--accent); }
    </style>
  </head>
  <body>
    <main>
      <h1>Yuma</h1>
      <p>Runtime endpoint for the Discord bot.</p>
      <div class="status">${discordReady ? 'Discord connected' : 'Discord booting'}</div>
      <ul>
        <li><code>/health</code> returns process, DB, Discord, and voice diagnostics.</li>
        <li><code>/ready</code> reports whether the Discord client is fully ready.</li>
        <li><code>/ping</code> is for lightweight uptime checks.</li>
      </ul>
    </main>
  </body>
</html>`
      );
      return;
    }

    if (requestUrl.pathname === '/health') {
      sendJson(res, 200, buildHealthPayload({ runtimeState, client, getDiagnostics }));
      return;
    }

    if (requestUrl.pathname === '/ready') {
      const ready = typeof client.isReady === 'function' ? client.isReady() : false;
      sendJson(res, ready ? 200 : 503, {
        ready,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (requestUrl.pathname === '/ping') {
      sendJson(res, 200, {
        message: 'pong',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime())
      });
      return;
    }

    if (requestUrl.pathname === '/listen') {
      sendHtml(res, 200, buildListenPageHtml());
      return;
    }

    if (requestUrl.pathname === '/voice-status') {
      const guildId = requestUrl.searchParams.get('guildId');
      sendJson(res, 200, liveVoiceStream ? liveVoiceStream.getStatus(guildId) : { active: false, streams: [] });
      return;
    }

    if (requestUrl.pathname === '/join-channel') {
      const channelId = requestUrl.searchParams.get('channelId');
      if (!channelId) {
        sendJson(res, 400, { error: 'Missing channelId param' });
        return;
      }
      const channel = client.channels.cache.get(channelId);
      if (!channel) {
        sendJson(res, 404, { error: 'Channel not found in cache', channelId });
        return;
      }
      if (channel.type !== 2 && channel.type !== 13) {
        sendJson(res, 400, { error: 'Not a voice channel', type: channel.type });
        return;
      }
      if (typeof onJoinChannel !== 'function') {
        sendJson(res, 500, { error: 'onJoinChannel callback not configured' });
        return;
      }
      try {
        onJoinChannel(channel.id, channel.guild.id, channel.guild.voiceAdapterCreator, channel.name, channel.guild.name);
        sendJson(res, 200, { ok: true, channelId: channel.id, channelName: channel.name, guildId: channel.guild.id, guildName: channel.guild.name });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    sendText(res, 404, 'Not found');
  });

  if (liveVoiceStream) {
    server.on('upgrade', (req, socket, head) => {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      if (requestUrl.pathname === '/voice-stream') {
        liveVoiceStream.handleUpgrade(req, socket, head);
      } else {
        socket.destroy();
      }
    });
  }

  return {
    start() {
      return new Promise((resolve) => {
        server.listen(config.port, '0.0.0.0', () => {
          console.log(`[WEB] Listening on 0.0.0.0:${config.port}`);
          resolve(server);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

module.exports = {
  createWebServer
};
