# JanJan Discord AI Bot

JanJan is a Discord AI bot with:

- Groq-backed chat replies
- text-to-speech and speech-to-text voice flows
- Postgres-backed memory and saved voice state
- Render-safe health endpoints and boot diagnostics
- 24/7 voice rejoin scheduling that survives restarts

## Requirements

- Node.js 22+
- Python 3
- FFmpeg
- A Discord bot token
- A Postgres database URL
- At least one Groq API key

## Environment

Use [`.env.example`](/c:/Users/Aloof/Desktop/Andrei/JanJan/.env.example) as the template.

Required:

- `DISCORD_TOKEN`
- `DATABASE_URL`
- `GROQ_API_KEY` or `GROQ_API_KEY1` / `GROQ_API_KEY2`

Optional:

- `WEB_ENABLED`
- `PUBLIC_BASE_URL`
- `SELF_PING_ENABLED`
- `SELF_PING_INTERVAL_MS`

## Local Run

```bash
npm install
npm run check
npm start
```

## Render Deploy

The simplest push-and-auto-deploy architecture for this repo is:

- one Docker `web service`

This repo includes `render.yaml` for a single free Docker web service setup.

Recommended flow:

1. Create the service from `render.yaml`.
2. Fill in the secret env vars on the `janjanbot` service:
   - `DISCORD_TOKEN`
   - `DATABASE_URL`
   - `GROQ_API_KEY*`
   - optional API keys like `TAVILY_API_KEY`, `LEONARDO_API_KEY`, `DEEPSEEK_API_KEY`
3. Deploy.

Render health endpoints when `WEB_ENABLED=true`:

- `/health` - runtime + Discord + DB + voice diagnostics
- `/ready` - Discord client readiness
- `/ping` - lightweight uptime target

## 24/7 Voice Behavior

JanJan now stores the last joined VC in Postgres and will:

- reload the saved VC after restart
- schedule deduplicated rejoin attempts
- rejoin after disconnect, destroy, or forced move/kick
- expose the current voice state in `/health`

If `DATABASE_URL` is missing, this persistence does not work, so keep it configured in Render.

## Commands

- `j!join`
- `j!leave`
- `j!vc <text>`
- `j!ask [question]`
- `j!listen`
- `j!stop`
- `j!voice <m|f>`
- `j!view @user`
- `j!status <text>`
- `j!admin`
- `j!help`
