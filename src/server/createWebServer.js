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
    <title>403 Forbidden</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #000; }

      /* ── GIF background ── */
      #bg {
        position: fixed; inset: 0;
        background: url('/bg.gif') center/cover no-repeat;
        opacity: 0.45;
        z-index: 0;
        pointer-events: none;
      }

      /* ── gate screen ── */
      #gate {
        position: fixed; inset: 0;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        transition: opacity .6s ease;
      }
      #gate.fade-out { opacity: 0; pointer-events: none; }
      .terminal {
        width: min(460px, 92vw);
        font-family: 'Courier New', Courier, monospace;
        color: #00ff41;
        font-size: 0.82rem;
        line-height: 1.7;
        user-select: none;
        background: rgba(0,0,0,0.82);
        padding: 28px 24px;
        border: 1px solid #0d3d14;
      }
      .t-line { white-space: pre; }
      .t-dim { color: #1a6b22; }
      .t-warn { color: #ff3c3c; }
      .t-hi { color: #00ff41; font-weight: bold; }
      .slots {
        display: flex;
        gap: 10px;
        margin: 18px 0 6px;
      }
      .slot {
        width: 28px; height: 28px;
        border: 1px solid #1a6b22;
        display: flex; align-items: center; justify-content: center;
        font-size: 1rem;
        transition: border-color .15s, color .15s;
      }
      .slot.filled { border-color: #00ff41; color: #00ff41; }
      .slot.err    { border-color: #ff3c3c; color: #ff3c3c; animation: shake .35s ease; }
      @keyframes shake {
        0%,100%{transform:translateX(0)}
        20%{transform:translateX(-5px)}
        40%{transform:translateX(5px)}
        60%{transform:translateX(-4px)}
        80%{transform:translateX(4px)}
      }
      .blink { animation: blink 1s step-end infinite; }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      #t-status { min-height: 1.2em; margin-top: 6px; }

      /* ── keypad display ── */
      #kp-display {
        margin-top: 10px;
        padding: 8px 12px;
        background: rgba(0,0,0,0.7);
        border: 1px solid #1a6b22;
        font-family: 'Courier New', Courier, monospace;
        font-size: 1rem;
        color: #00ff41;
        letter-spacing: 0.2em;
        min-height: 2.2em;
        display: flex;
        align-items: center;
      }

      /* ── keypad grid ── */
      .keypad {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin: 12px 0 4px;
      }
      .kp {
        padding: 12px 0;
        background: rgba(0,0,0,0.6);
        color: #00ff41;
        border: 1px solid #1a6b22;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.95rem;
        font-weight: bold;
        cursor: pointer;
        letter-spacing: 0.05em;
        transition: background .1s, border-color .1s;
        user-select: none;
      }
      .kp:hover   { background: rgba(0,255,65,0.1); border-color: #00ff41; }
      .kp:active  { background: rgba(0,255,65,0.25); }
      .kp-clr     { color: #f59e0b; border-color: #7c5a00; }
      .kp-clr:hover { background: rgba(245,158,11,0.1); border-color: #f59e0b; }
      .kp-enter   { color: #00ff41; border-color: #00ff41; background: rgba(0,255,65,0.08); }
      .kp-enter:hover { background: rgba(0,255,65,0.22); }

      /* ── listen UI (hidden until unlocked) ── */
      #app {
        display: none;
        min-height: 100vh;
        background: transparent;
        align-items: center;
        justify-content: center;
        padding: 20px;
        position: relative;
        z-index: 10;
      }
      #app.visible { display: flex; }
      .app-terminal {
        width: min(500px, 92vw);
        font-family: 'Courier New', Courier, monospace;
        color: #00ff41;
        font-size: 0.82rem;
        line-height: 1.8;
        background: rgba(0,0,0,0.82);
        padding: 28px 24px;
        border: 1px solid #0d3d14;
      }
      .a-line { white-space: pre; }
      .a-dim  { color: #1a6b22; }
      .a-warn { color: #ff3c3c; }
      .a-hi   { color: #00ff41; font-weight: bold; }
      .a-amber { color: #f59e0b; }

      /* status tag */
      .status-tag { font-weight: bold; }
      .status-tag.live        { color: #00ff41; }
      .status-tag.offline     { color: #ff3c3c; }
      .status-tag.reconnecting{ color: #f59e0b; }

      /* visualizer bars (shown when live) */
      .viz {
        display: none;
        gap: 3px;
        align-items: flex-end;
        height: 18px;
        margin-left: 8px;
        vertical-align: middle;
      }
      .viz.active { display: inline-flex; }
      .viz-bar {
        width: 3px;
        background: #00ff41;
        animation: vbar 0.8s ease-in-out infinite alternate;
      }
      .viz-bar:nth-child(1){ height: 6px;  animation-delay: 0s;    }
      .viz-bar:nth-child(2){ height: 14px; animation-delay: .12s;  }
      .viz-bar:nth-child(3){ height: 10px; animation-delay: .24s;  }
      .viz-bar:nth-child(4){ height: 16px; animation-delay: .06s;  }
      .viz-bar:nth-child(5){ height: 8px;  animation-delay: .18s;  }
      @keyframes vbar { from{opacity:.3} to{opacity:1} }

      /* channel select */
      .ch-select-wrap { margin-top: 4px; }
      .ch-select-wrap .a-dim { display: block; margin-bottom: 2px; }
      select {
        width: 100%;
        padding: 6px 10px;
        background: #000;
        color: #00ff41;
        border: 1px solid #1a6b22;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.82rem;
        outline: none;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
      }
      select:focus { border-color: #00ff41; }
      select option { background: #000; color: #00ff41; }

      /* action button */
      .cmd-btn {
        margin-top: 20px;
        width: 100%;
        padding: 10px 14px;
        background: #000;
        color: #00ff41;
        border: 1px solid #00ff41;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.85rem;
        font-weight: bold;
        letter-spacing: 0.08em;
        cursor: pointer;
        text-align: left;
        transition: background .12s, color .12s;
      }
      .cmd-btn:disabled {
        border-color: #1a6b22;
        color: #1a6b22;
        cursor: not-allowed;
      }
      .cmd-btn:not(:disabled):hover {
        background: #00ff41;
        color: #000;
      }
      .cmd-btn.stop {
        border-color: #ff3c3c;
        color: #ff3c3c;
      }
      .cmd-btn.stop:not(:disabled):hover {
        background: #ff3c3c;
        color: #000;
      }
    </style>
  </head>
  <body>
    <div id="bg"></div>

    <!-- ═══════════════════  GATE  ═══════════════════ -->
    <div id="gate">
      <div class="terminal">
        <div class="t-line t-dim">──────────────────────────────────────</div>
        <div class="t-line t-hi">  RESTRICTED ACCESS TERMINAL v2.1.0</div>
        <div class="t-line t-dim">──────────────────────────────────────</div>
        <div class="t-line">&nbsp;</div>
        <div class="t-line t-dim">  [SYS] authentication required</div>
        <div class="t-line t-dim">  [SYS] awaiting input sequence...</div>
        <div class="t-line">&nbsp;</div>
        <div class="t-line">  ENTER PASSKEY</div>
        <div id="kp-display">
          <span id="kp-chars"></span><span class="blink">▋</span>
        </div>
        <div class="slots" id="slots">
          <div class="slot" id="s0">_</div>
          <div class="slot" id="s1">_</div>
          <div class="slot" id="s2">_</div>
          <div class="slot" id="s3">_</div>
          <div class="slot" id="s4">_</div>
        </div>
        <div class="keypad">
          <button class="kp" data-k="1">1</button>
          <button class="kp" data-k="2">2</button>
          <button class="kp" data-k="3">3</button>
          <button class="kp" data-k="4">4</button>
          <button class="kp" data-k="5">5</button>
          <button class="kp" data-k="6">6</button>
          <button class="kp" data-k="7">7</button>
          <button class="kp" data-k="8">8</button>
          <button class="kp" data-k="9">9</button>
          <button class="kp kp-clr" data-k="CLR">CLR</button>
          <button class="kp" data-k="0">0</button>
          <button class="kp kp-enter" data-k="ENTER">ENT</button>
        </div>
        <div class="t-line t-dim" id="t-status">&nbsp;</div>
      </div>
    </div>

    <!-- ═══════════════════  APP  ═══════════════════ -->
    <div id="app">
      <div class="app-terminal">
        <div class="a-line a-dim">──────────────────────────────────────────────</div>
        <div class="a-line a-hi">  AUDIO INTERCEPT MODULE — STREAM MONITOR</div>
        <div class="a-line a-dim">──────────────────────────────────────────────</div>
        <div class="a-line">&nbsp;</div>
        <div class="a-line a-dim">  [SYS] session authenticated</div>
        <div class="a-line a-dim">  [SYS] probing voice channels...</div>
        <div class="a-line">&nbsp;</div>
        <div class="a-line">  STATUS  &gt; <span class="status-tag offline" id="statusText">[ OFFLINE ]</span><span class="viz" id="viz"><span class="viz-bar"></span><span class="viz-bar"></span><span class="viz-bar"></span><span class="viz-bar"></span><span class="viz-bar"></span></span></div>
        <div class="a-line a-dim" id="channelInfo">  TARGET  &gt; no active voice channel</div>
        <div class="a-line">&nbsp;</div>
        <div class="ch-select-wrap" id="selectWrap" style="display:none;">
          <div class="a-line a-dim">  CHANNEL &gt; select target feed</div>
          <select id="channelSelect"></select>
          <div class="a-line">&nbsp;</div>
        </div>
        <button class="cmd-btn" id="listenBtn" disabled>  &gt; [ INIT STREAM ]</button>
        <div class="a-line">&nbsp;</div>
        <div class="a-line a-dim">  root@localhost:~$ <span class="blink">▋</span></div>
      </div>
    </div>

    <script>
      /* ══════════════════════════════════════════════
         GATE LOGIC
         Password = exactly 5 Enter presses.
         Spam detection: presses < 180 ms apart reset the counter.
      ══════════════════════════════════════════════ */
      const MIN_GAP_MS = 180; // minimum ms between valid presses
      let count = 0;
      let lastPressTime = 0;
      let lockout = false; // brief cooldown after a denial

      const gate    = document.getElementById('gate');
      const tStatus = document.getElementById('t-status');
      const slots   = [0,1,2,3,4].map(i => document.getElementById('s' + i));
      const kpChars = document.getElementById('kp-chars');
      let typed = '';

      function updateDisplay() {
        kpChars.textContent = typed.replace(/./g, '●');
      }

      function updateSlots(n, mode) {
        slots.forEach((el, i) => {
          el.className = 'slot';
          if (mode === 'err') { el.classList.add('err'); el.textContent = 'X'; }
          else if (i < n)     { el.classList.add('filled'); el.textContent = '●'; }
          else                { el.textContent = '_'; }
        });
      }

      function deny(msg) {
        lockout = true; count = 0; lastPressTime = 0; typed = ''; updateDisplay();
        updateSlots(5, 'err');
        tStatus.className = 't-line t-warn';
        tStatus.textContent = '  [ERR] ' + msg;
        setTimeout(() => {
          lockout = false; updateSlots(0, 'ok');
          tStatus.className = 't-line t-dim';
          tStatus.textContent = '  [SYS] awaiting input sequence...';
        }, 900);
      }

      function unlock() {
        tStatus.className = 't-line t-hi';
        tStatus.textContent = '  [OK]  access granted';
        lockout = true;
        gate.classList.add('fade-out');
        setTimeout(() => {
          gate.style.display = 'none';
          document.getElementById('app').classList.add('visible');
          initApp();
        }, 650);
      }

      function handleEnter() {
        if (lockout) return;
        const now = Date.now();
        if (lastPressTime !== 0 && now - lastPressTime < MIN_GAP_MS) {
          deny('SEQUENCE REJECTED — slow down');
          return;
        }
        typed = ''; updateDisplay();
        lastPressTime = now;
        count++;
        updateSlots(count, 'ok');
        tStatus.className = 't-line t-dim';
        tStatus.textContent = '  [SYS] key ' + count + '/5 accepted';
        if (count === 5) unlock();
      }

      /* keypad clicks */
      document.querySelectorAll('.kp').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.k;
          if (k === 'ENTER') { handleEnter(); }
          else if (k === 'CLR') { typed = ''; updateDisplay(); }
          else if (!lockout && typed.length < 12) { typed += k; updateDisplay(); }
        });
      });

      /* physical keyboard still works */
      document.addEventListener('keydown', (e) => {
        if (lockout) return;
        if (e.key === 'Enter') { e.preventDefault(); handleEnter(); }
        else if (e.key === 'Backspace') { typed = typed.slice(0,-1); updateDisplay(); }
        else if (/^[0-9a-zA-Z]$/.test(e.key) && typed.length < 12) { typed += e.key; updateDisplay(); }
      });

      /* ══════════════════════════════════════════════
         AUDIO APP (boots only after unlock)
      ══════════════════════════════════════════════ */
      function initApp() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const statusText = document.getElementById('statusText');
        const channelInfo = document.getElementById('channelInfo');
        const listenBtn = document.getElementById('listenBtn');
        const channelSelect = document.getElementById('channelSelect');
        const selectWrap = document.getElementById('selectWrap');

        const SAMPLE_RATE = 48000;
        const CHANNELS = 1;
        const BUFFER_AHEAD_SEC = 0.25;

        let audioCtx = null;
        let audioChainInput = null;
        let nextStartTime = 0;
        let listening = false;
        let ws = null;
        let currentGuildId = null;
        let knownStreams = [];
        let streamWasOffline = false;
        let reconnectTimer = null;
        let reconnectDelay = 1000;
        let manuallyDisconnected = false;

        function setStatus(active, channelName, extra) {
          const viz = document.getElementById('viz');
          const isRecon = extra === 'Reconnecting…';
          statusText.className = 'status-tag ' + (isRecon ? 'reconnecting' : active ? 'live' : 'offline');
          statusText.textContent = isRecon ? '[ RECONNECTING ]' : active ? '[ LIVE ]' : '[ OFFLINE ]';
          if (viz) viz.className = 'viz' + (active && !isRecon ? ' active' : '');
          channelInfo.textContent = '  TARGET  > ' + (active
            ? (channelName || 'voice channel')
            : 'no active voice channel');
          listenBtn.disabled = !active && !isRecon;
        }

        function scheduleReconnect(guildId) {
          if (manuallyDisconnected) return;
          if (reconnectTimer) return;
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
          if (ws) {
            ws._noReconnect = true;
            try { ws.close(); } catch {}
            ws = null;
          }
          if (!isReconnect) reconnectDelay = 1000;
          currentGuildId = guildId || null;
          const qs = currentGuildId ? ('?guildId=' + encodeURIComponent(currentGuildId)) : '';
          const socket = new WebSocket(proto + '//' + location.host + '/voice-stream' + qs);
          socket.binaryType = 'arraybuffer';
          ws = socket;

          socket.onopen = () => { reconnectDelay = 1000; };

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
            if (nextStartTime < now + 0.05) nextStartTime = now + BUFFER_AHEAD_SEC;
            source.start(nextStartTime);
            nextStartTime += frames / SAMPLE_RATE;
          };

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
            compressor.threshold.value = -24;
            compressor.knee.value = 10;
            compressor.ratio.value = 4;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            const outputGain = audioCtx.createGain();
            outputGain.gain.value = 1.1;

            hpf.connect(presence);
            presence.connect(compressor);
            compressor.connect(outputGain);
            outputGain.connect(audioCtx.destination);

            audioChainInput = hpf;
            nextStartTime = audioCtx.currentTime + BUFFER_AHEAD_SEC;
            listening = true;
            listenBtn.textContent = '  > [ KILL STREAM ]';
            listenBtn.classList.add('stop');

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
            listenBtn.textContent = '  > [ INIT STREAM ]';
            listenBtn.classList.remove('stop');
          }
        });

        refreshStreamList();
        setInterval(refreshStreamList, 5000);
      }
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
      const statusLabel = discordReady ? '[ ONLINE ]' : '[ CONNECTING ]';
      sendHtml(res, 200, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YUMA // SYS</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    #bg {
      position: fixed; inset: 0;
      background: url('/bg.gif') center/cover no-repeat;
      opacity: 0.45;
      z-index: 0;
      pointer-events: none;
    }
    .terminal {
      position: relative;
      z-index: 1;
      width: min(440px, 100%);
      background: rgba(0,0,0,0.82);
      border: 1px solid #0d3d14;
      padding: 28px 24px;
      font-family: 'Courier New', Courier, monospace;
      color: #00ff41;
      font-size: 0.82rem;
      line-height: 1.8;
    }
    .t-dim  { color: #1a6b22; }
    .t-hi   { color: #00ff41; font-weight: bold; }
    .t-warn { color: #ff3c3c; }
    .t-amber{ color: #f59e0b; }
    .blink  { animation: blink 1s step-end infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .divider { color: #1a6b22; }
    .status-ok  { color: #00ff41; font-weight: bold; }
    .status-off { color: #f59e0b; font-weight: bold; }
    .links { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
    a.cmd {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 7px 0;
      text-decoration: none;
      color: #00ff41;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.82rem;
      border-bottom: 1px solid #0a2a0e;
      transition: color .12s;
    }
    a.cmd:last-child { border-bottom: none; }
    a.cmd:hover { color: #fff; }
    a.cmd:hover .cmd-arrow { color: #00ff41; }
    .cmd-prompt { color: #1a6b22; flex-shrink: 0; }
    .cmd-label  { flex: 1; }
    .cmd-desc   { color: #1a6b22; font-size: 0.75rem; }
    .cmd-arrow  { color: #0d3d14; font-size: 1rem; transition: color .12s; }
  </style>
</head>
<body>
  <div id="bg"></div>
  <div class="terminal">
    <div class="divider">────────────────────────────────────────</div>
    <div class="t-hi">  YUMA SYSTEM TERMINAL v1.0</div>
    <div class="divider">────────────────────────────────────────</div>
    <div>&nbsp;</div>
    <div class="t-dim">  [SYS] host       &gt; discord.gg/yuma</div>
    <div class="t-dim">  [SYS] process    &gt; node index.js</div>
    <div>  [SYS] status     &gt; <span class="${discordReady ? 'status-ok' : 'status-off'}">${statusLabel}</span></div>
    <div>&nbsp;</div>
    <div class="divider">────────────────────────────────────────</div>
    <div class="t-dim">  AVAILABLE COMMANDS</div>
    <div class="divider">────────────────────────────────────────</div>
    <div class="links">
      <a class="cmd" href="/listen">
        <span class="cmd-prompt">$</span>
        <span class="cmd-label">./listen <span class="cmd-desc">-- stream voice channel live</span></span>
        <span class="cmd-arrow">›</span>
      </a>
      <a class="cmd" href="/health">
        <span class="cmd-prompt">$</span>
        <span class="cmd-label">./health <span class="cmd-desc">-- process &amp; diagnostics</span></span>
        <span class="cmd-arrow">›</span>
      </a>
      <a class="cmd" href="/ping">
        <span class="cmd-prompt">$</span>
        <span class="cmd-label">./ping <span class="cmd-desc">-- uptime check</span></span>
        <span class="cmd-arrow">›</span>
      </a>
    </div>
    <div>&nbsp;</div>
    <div class="t-dim">  root@yuma:~$ <span class="blink">▋</span></div>
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

    if (requestUrl.pathname === '/bg.gif') {
      const fs = require('node:fs');
      const path = require('node:path');
      const gifPath = path.join(__dirname, '../../attached_assets/download_1783082441662.gif');
      try {
        const data = fs.readFileSync(gifPath);
        res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=86400' });
        res.end(data);
      } catch {
        sendText(res, 404, 'Not found');
      }
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
