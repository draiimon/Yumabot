# PLAYGROUND welcome (JanJan + original zip)

Uses the **original** `playground-discord-bot.zip` canvas code in `src/welcome/welcomeCanvas.js` (900×280 PNG). Event flow matches zip `src/index.js` via `src/welcome/playgroundWelcome.js`.

---

## Features (from zip README)

- Dynamic welcome card on every member join
- Auto-fetches member avatar, username, and server name
- Scales typography based on username length
- Neon glow effects — cyan / purple / pink
- Member count badge in a hex shape
- Dark background with grid and corner brackets

---

## JanJan setup (already done)

1. **Dependencies** — `@napi-rs/canvas` is in root `package.json` (`npm install` in JanJan folder).
2. **Logo** — copy is at `assets/logo.png` (from zip `assets/logo.png`).
3. **Token** — use existing JanJan `.env` → `DISCORD_TOKEN=...`
4. **Intents** — JanJan already has `GuildMembers` in `index.js`.
5. **Welcome channel** — `data/member-log-config.json`:

```json
"welcomeChannelId": "1426746103616897129"
```

(spawn-point channel). If unset, bot falls back to zip behaviour: system channel → channel named `welcome` or `general`.

6. **Run** — `npm start` (JanJan `index.js` registers welcome on startup).

---

## File mapping (zip → JanJan)

| Zip | JanJan |
|-----|--------|
| `assets/logo.png` | `assets/logo.png` |
| `src/welcomeCanvas.js` | `src/welcome/welcomeCanvas.js` |
| `src/index.js` | `src/welcome/playgroundWelcome.js` + `index.js` |

---

## Customisation (from zip README)

Edit `src/welcome/welcomeCanvas.js`:

| Constant | Description |
|----------|-------------|
| `W`, `H` | Canvas size (default 900×280) |
| `COLORS` | Palette |
| Welcome subtext | `drawText()` wrap line |

Change welcome channel in `data/member-log-config.json` or edit `resolveWelcomeChannel()` in `playgroundWelcome.js`.

---

## Test

```bash
node scripts/test-playground-welcome.js
```

---

## Tech stack

- `discord.js` v14
- `@napi-rs/canvas`
- `dotenv` (JanJan root)
