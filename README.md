# Yuma

Discord bot na may AI chat, boses (TTS/STT), at memory per user gamit ang Postgres. Bad boy attitude, Taglish replies, medyo masungit pero helpful pag kailangan.

## Ano meron

- AI replies gamit ang Groq
- Voice: makikinig at makakausap sa VC (text-to-speech / speech-to-text)
- Naka-save ang memory ng bawat user sa Postgres (di malilimutan pag nagpalit ka topic)
- Health checks para sa Render
- Auto rejoin sa VC pag na-disconnect o na-restart ang server

## Kailangan bago patakbuhin

- Node.js 22+
- Python 3
- FFmpeg
- Discord bot token
- Postgres database URL
- Groq API key (isa man lang)

## Setup

Kopyahin muna ang `.env.example` bilang `.env` tapos punuan:

- `DISCORD_TOKEN`
- `DATABASE_URL`
- `GROQ_API_KEY` (o `GROQ_API_KEY1`, `GROQ_API_KEY2`, ... kung marami ka)

Optional na env vars:

- `WEB_ENABLED`
- `PUBLIC_BASE_URL`
- `SELF_PING_ENABLED`
- `SELF_PING_INTERVAL_MS`

## Patakbuhin sa local

```bash
npm install
npm start
```

## Deploy sa Render

May kasama nang `render.yaml` sa repo na ito para sa isang Docker web service.

1. Gawa ng bagong service galing sa `render.yaml`.
2. Punan ang env vars sa dashboard ng Render:
   - `DISCORD_TOKEN`
   - `DATABASE_URL`
   - `GROQ_API_KEY` (at extras kung meron)
   - optional: `TAVILY_API_KEY`, iba pang API keys na ginagamit mo
3. Deploy na.

Kung `WEB_ENABLED=true`, meron health endpoints:

- `/health` — status ng bot, DB, at voice
- `/ready` — kung ready na ang Discord client
- `/ping` — pang-uptime lang

## Voice / VC behavior

- Naaalala kung saang VC huling sumali gamit ang Postgres
- Babalik sa parehong VC pagkatapos ma-restart
- Auto rejoin pag na-disconnect o na-kick
- Makikita ang current voice state sa `/health`

Kung walang `DATABASE_URL`, hindi gagana ang mga naka-save na state na ito.

## Commands

- `j!join` — sumali sa VC
- `j!leave` — umalis sa VC
- `j!vc <text>` — magsalita sa VC
- `j!ask <tanong>` — magtanong
- `j!listen` — pakinggan ang boses
- `j!stop` — itigil ang pagsasalita
- `j!voice <m|f>` — palitan ang boses
- `j!view @user` — tignan ang impormasyon ng user
- `j!status <text>` — palitan ang status
- `j!admin` — admin panel
- `j!help` — listahan ng commands
