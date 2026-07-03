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
    <title>Yuma · Listen Live</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f1117;
        color: #e8eaf0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .card {
        width: min(420px, 100%);
        background: #181b24;
        border: 1px solid #2a2d3a;
        border-radius: 16px;
        padding: 32px 28px;
        text-align: center;
      }
      .icon { font-size: 2rem; margin-bottom: 12px; }
      h1 { font-size: 1.4rem; font-weight: 600; color: #fff; letter-spacing: -0.02em; }
      .subtitle { margin-top: 6px; font-size: 0.85rem; color: #6b7280; }
      .divider { border: none; border-top: 1px solid #2a2d3a; margin: 24px 0; }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .badge.live { background: rgba(52,211,153,0.12); color: #34d399; }
      .badge.offline { background: rgba(107,114,128,0.15); color: #6b7280; }
      .badge.reconnecting { background: rgba(251,191,36,0.12); color: #fbbf24; }
      .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: currentColor;
      }
      .dot.pulse { animation: pulse 1.4s ease-in-out infinite; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .channel-info { margin-top: 10px; font-size: 0.83rem; color: #6b7280; min-height: 1.2em; }
      .select-wrap { margin-top: 20px; text-align: left; }
      .select-wrap label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; display: block; }
      select {
        width: 100%;
        padding: 9px 12px;
        background: #0f1117;
        color: #e8eaf0;
        border: 1px solid #2a2d3a;
        border-radius: 8px;
        font-size: 0.875rem;
        outline: none;
        cursor: pointer;
      }
      select:focus { border-color: #4f6ef7; }
      .btn {
        margin-top: 24px;
        width: 100%;
        padding: 12px;
        font-size: 0.95rem;
        font-weight: 600;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: opacity .15s, transform .1s;
        background: #4f6ef7;
        color: #fff;
        letter-spacing: -0.01em;
      }
      .btn:disabled { opacity: 0.35; cursor: not-allowed; }
      .btn:not(:disabled):hover { opacity: 0.88; }
      .btn:not(:disabled):active { transform: scale(0.98); }
      .btn.stop { background: #374151; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">🎧</div>
      <h1>Listen Live</h1>
      <p class="subtitle">Yuma · Voice Stream</p>
      <hr class="divider">
      <div id="statusBadge" class="badge offline"><span class="dot" id="dot"></span><span id="statusText">Offline</span></div>
      <p class="channel-info" id="channelInfo">No active voice channel.</p>
      <div class="select-wrap" id="selectWrap" style="display:none;">
        <label for="channelSelect">Channel</label>
        <select id="channelSelect"></select>
      </div>
      <button class="btn" id="listenBtn" disabled>Play</button>
    </div>
    <script>
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const statusText = document.getElementById('statusText');
      const channelInfo = document.getElementById('channelInfo');
      const listenBtn = document.getElementById('listenBtn');
      const channelSelect = document.getElementById('channelSelect');
      const selectWrap = document.getElementById('selectWrap');

      const SAMPLE_RATE = 48000; // server sends 48kHz mono (native Discord/Opus rate, no decimation)
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
        const badge = document.getElementById('statusBadge');
        const dot = document.getElementById('dot');
        badge.className = 'badge ' + (extra === 'Reconnecting…' ? 'reconnecting' : active ? 'live' : 'offline');
        dot.className = 'dot' + (active ? ' pulse' : '');
        statusText.textContent = extra || (active ? 'Live' : 'Offline');
        channelInfo.textContent = active
          ? 'Connected to: ' + (channelName || 'voice channel')
          : 'No active voice channel.';
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
            selectWrap.style.display = 'block';
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
            selectWrap.style.display = 'none';
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
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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
          listenBtn.textContent = 'Stop';
          listenBtn.classList.add('stop');
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
          listenBtn.textContent = 'Play';
          listenBtn.classList.remove('stop');
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
      sendHtml(res, 200, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Yuma</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e8eaf0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: min(380px, 100%);
      background: #181b24;
      border: 1px solid #2a2d3a;
      border-radius: 16px;
      padding: 28px 24px;
    }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .avatar {
      width: 40px; height: 40px;
      background: #252836;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.25rem;
    }
    .name { font-size: 1.1rem; font-weight: 600; color: #fff; }
    .sub  { font-size: 0.78rem; color: #6b7280; margin-top: 2px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    .badge.ok  { background: rgba(52,211,153,0.12); color: #34d399; }
    .badge.off { background: rgba(107,114,128,0.15); color: #6b7280; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    hr { border: none; border-top: 1px solid #2a2d3a; margin-bottom: 20px; }
    .links { display: flex; flex-direction: column; gap: 8px; }
    a.row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px;
      background: #0f1117;
      border: 1px solid #2a2d3a;
      border-radius: 9px;
      text-decoration: none;
      color: #e8eaf0;
      font-size: 0.875rem;
      transition: border-color .15s;
    }
    a.row:hover { border-color: #4f6ef7; }
    a.row .label { font-weight: 500; }
    a.row .desc  { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
    a.row .arrow { color: #4b5563; font-size: 0.9rem; }
    a.row .left  { display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="avatar">🤖</div>
      <div>
        <div class="name">Yuma</div>
        <div class="sub">Discord Bot</div>
      </div>
    </div>
    <div class="badge ${discordReady ? 'ok' : 'off'}">
      <span class="dot"></span>
      ${discordReady ? 'Online' : 'Connecting'}
    </div>
    <hr>
    <div class="links">
      <a class="row" href="/listen">
        <div class="left">
          <span class="label">🎧 Listen Live</span>
          <span class="desc">Stream the voice channel in your browser</span>
        </div>
        <span class="arrow">›</span>
      </a>
      <a class="row" href="/health">
        <div class="left">
          <span class="label">Health</span>
          <span class="desc">Process, DB, Discord, and voice diagnostics</span>
        </div>
        <span class="arrow">›</span>
      </a>
      <a class="row" href="/ping">
        <div class="left">
          <span class="label">Ping</span>
          <span class="desc">Lightweight uptime check</span>
        </div>
        <span class="arrow">›</span>
      </a>
    </div>
  </div>
</body>
</html>`);
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
