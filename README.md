# Yuma — Discord AI Bot

A self-hosted Discord bot with persistent AI memory, voice channel integration, live audio streaming, and a terminal-style web dashboard. Built for 24/7 deployment on Render (Docker).

---

## Features

- **AI Chat** — Context-aware replies powered by Groq (LLaMA / Mixtral). Per-user memory stored in PostgreSQL — the bot remembers conversation history across sessions.
- **Voice — TTS & STT** — Speaks responses aloud in voice channels via TTS. Listens and transcribes speech via Groq Whisper (STT).
- **24/7 Voice Persistence** — Saves the last joined voice channel to the database. Auto-rejoins on restart, disconnect, or kick. Configurable auto-rejoin toggle per server.
- **Live Audio Stream** — Web dashboard at `/listen` streams the bot's voice channel audio in real-time over WebSocket to any browser.
- **Image Generation** — Generates images via Leonardo AI on command.
- **Web Research** — Pulls live search results via Tavily and summarizes them.
- **Channel Summarizer** — Backread and summarize recent chat history on demand.
- **Health Dashboard** — `/health` endpoint exposes bot status, DB state, voice connection, memory usage, and uptime.
- **Cosmetic Voice State** — Bot appears server-muted and server-deafened in Discord (red icons) while still fully functional internally.

---

## Requirements

- Node.js 22+
- Python 3.11+
- FFmpeg
- PostgreSQL database
- Discord bot token
- Groq API key (supports key rotation: `GROQ_API_KEY1` through `GROQ_API_KEY6`)

Optional:
- `TAVILY_API_KEY` — web research
- `LEONARDO_API_KEY` — image generation
- `DEEPSEEK_API_KEY` — fallback AI model

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `GROQ_API_KEY` | ✅ | Groq API key (or use `GROQ_API_KEY1`–`GROQ_API_KEY6`) |
| `TAVILY_API_KEY` | ❌ | For web research commands |
| `LEONARDO_API_KEY` | ❌ | For image generation |
| `DEEPSEEK_API_KEY` | ❌ | Fallback AI model |
| `WEB_ENABLED` | ❌ | Set to `true` to enable the web dashboard |
| `SELF_PING_ENABLED` | ❌ | Set to `true` to keep Render free tier awake |

---

## Running Locally

```bash
npm install
npm start
```

The bot connects to Discord and optionally starts a web server on port `3000` (or `PORT` env var).

---

## Deploying to Render

A `render.yaml` is included for one-click Docker deployment.

1. Create a new service from `render.yaml` in your Render dashboard.
2. Add all required environment variables.
3. Deploy — the bot starts automatically and reconnects to the last saved voice channel.

Web endpoints (when `WEB_ENABLED=true`):

| Endpoint | Description |
|---|---|
| `/` | Terminal-style status dashboard |
| `/listen` | Live voice channel audio stream |
| `/health` | Full diagnostics JSON |
| `/ping` | Uptime check |
| `/ready` | Discord client readiness check |

---

## Commands

| Command | Description |
|---|---|
| `j!join` | Join your current voice channel |
| `j!leave` | Leave the voice channel |
| `j!autojoin on/off` | Toggle auto-rejoin when moved or disconnected |
| `j!vc <text>` | Speak text aloud in the voice channel (TTS) |
| `j!autotts on/off` | Toggle automatic TTS for all messages |
| `j!ask <question>` | Ask the bot a question (STT-aware) |
| `j!listen` | Start listening / transcribing voice |
| `j!stop` | Stop listening or TTS |
| `j!chat <message>` | Direct AI chat message |
| `j!research <query>` | Web search + AI summary |
| `j!summarize` | Summarize recent channel messages |
| `j!img <prompt>` | Generate an image |
| `j!portray <prompt>` | Generate a portrait-style image |
| `j!view [@user]` | View user profile and memory summary |
| `j!status <text>` | Set bot status/activity |
| `j!stats` | Server statistics |
| `j!ping` | Latency check |
| `j!help` | Full command list |
| `j!admin` | Admin panel (restricted) |

---

## Project Structure

```
index.js              # Main bot entry — all Discord logic, commands, event handlers
src/
  voice/              # Voice connection, TTS, STT, live audio streaming
  server/             # HTTP web server and dashboard
scripts/              # Utility and setup scripts
public/               # Static assets (background, etc.)
data/                 # Runtime data (gitignored)
docs/                 # Additional documentation
```

---

## License

MIT
