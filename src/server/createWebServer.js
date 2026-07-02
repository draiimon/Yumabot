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
      main { width:min(520px,100%); background:var(--panel); border:1px solid rgba(255,255,255,0.08); border-radius:24px; padding:28px; backdrop-filter:blur(14px); box-shadow:0 28px 80px rgba(0,0,0,0.35); text-align:center; }
      h1 { margin:0 0 8px; font-size:clamp(1.6rem,4vw,2.2rem); }
      p { margin:8px 0 0; color:var(--muted); }
      .status { margin:20px 0; display:inline-flex; align-items:center; gap:10px; padding:10px 14px; border-radius:999px; background:rgba(94,230,168,0.12); color:var(--ok); font-weight:700; }
      .status.off { background:rgba(255,107,107,0.12); color:var(--bad); }
      button { margin-top:18px; padding:14px 28px; font-size:1rem; font-weight:700; border:none; border-radius:999px; background:var(--accent); color:#1a0a10; cursor:pointer; }
      button:disabled { opacity:0.5; cursor:not-allowed; }
      .dot { width:8px; height:8px; border-radius:50%; background:currentColor; display:inline-block; }
    </style>
  </head>
  <body>
    <main>
      <h1>🎧 Yuma — Listen Live</h1>
      <p id="channelInfo">Kinukuha ang status ng voice channel...</p>
      <div class="status off" id="statusPill"><span class="dot"></span><span id="statusText">Offline</span></div>
      <br>
      <button id="listenBtn" disabled>▶ Listen Live</button>
    </main>
    <script>
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(proto + '//' + location.host + '/voice-stream');
      ws.binaryType = 'arraybuffer';

      const statusPill = document.getElementById('statusPill');
      const statusText = document.getElementById('statusText');
      const channelInfo = document.getElementById('channelInfo');
      const listenBtn = document.getElementById('listenBtn');

      const SAMPLE_RATE = 48000;
      const CHANNELS = 2;
      const FRAME_SAMPLES = 960;

      let audioCtx = null;
      let nextStartTime = 0;
      let listening = false;

      function setStatus(active, channelName) {
        statusPill.classList.toggle('off', !active);
        statusText.textContent = active ? 'Live' : 'Offline';
        channelInfo.textContent = active
          ? ('Naka-connect ang bot sa: ' + (channelName || 'voice channel'))
          : 'Wala pang bot sa voice channel ngayon.';
        listenBtn.disabled = !active;
      }

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'status') setStatus(msg.active, msg.channelName);
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
        source.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        if (nextStartTime < now + 0.05) nextStartTime = now + 0.08;
        source.start(nextStartTime);
        nextStartTime += frames / SAMPLE_RATE;
      };

      listenBtn.addEventListener('click', async () => {
        if (!listening) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          nextStartTime = audioCtx.currentTime + 0.1;
          listening = true;
          listenBtn.textContent = '⏸ Stop';
        } else {
          listening = false;
          if (audioCtx) { await audioCtx.close(); audioCtx = null; }
          listenBtn.textContent = '▶ Listen Live';
        }
      });
    </script>
  </body>
</html>`;
}

function createWebServer({ config, runtimeState, client, getDiagnostics, liveVoiceStream }) {
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
      sendJson(res, 200, liveVoiceStream ? liveVoiceStream.getStatus() : { active: false });
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
