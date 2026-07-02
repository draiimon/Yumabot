---
name: Discord voice connection stuck at "signalling" — DAVE native binding
description: Voice connection never reaches Ready and loops signalling/connecting; root cause is a missing platform-specific native binding for the DAVE (E2EE voice) library, not networking/UDP/firewall issues.
---

## Symptom
`@discordjs/voice` connection (via `joinVoiceChannel`) shows the bot as "connected" in Discord's UI, but internally the connection state cycles `signalling -> connecting -> connecting -> signalling` forever and never reaches `Ready`. No TTS/audio playback or voice receiving works. Looks like a network/UDP/firewall problem but is not.

## Root cause
Discord now requires DAVE (end-to-end encrypted voice) on some voice servers. `@discordjs/voice` dynamically imports `@snazzah/davey` to negotiate DAVE support in the Identify payload (`max_dave_protocol_version`). If that package's platform-specific native binding (e.g. `@snazzah/davey-linux-x64-gnu`) failed to install — npm's known optional-dependency bug (https://github.com/npm/cli/issues/4828) silently skips it — the dynamic import throws "Cannot find native binding", `max_dave_protocol_version` falls back to `0`, and DAVE-required voice servers immediately close the socket with WS close code `4017` ("E2EE/DAVE protocol required"). `@discordjs/voice` then quietly reverts to "signalling" and retries the same failing handshake forever, without surfacing 4017 anywhere in normal logs.

## How to diagnose
- Pass `debug: true` to `joinVoiceChannel(...)` and listen to `connection.on('debug', ...)` to see internal networking state transitions.
- To see the actual raw WebSocket close code (not exposed by discordjs/voice's own debug logs), monkey-patch `require('ws').prototype.emit` to log `'close'` events with `(code, reason)` before requiring/using `@discordjs/voice`.
- Check `node_modules/@snazzah/davey*` for a `.node` native binary; if only the base `@snazzah/davey` package exists (no platform variant folder), the binding is missing.

## Fix
`npm install @snazzah/davey-<platform-triple>@<version>` matching the installed `@snazzah/davey` version (e.g. `@snazzah/davey-linux-x64-gnu` on Replit's x86_64 Linux containers). Optionally also pre-warm `import('@snazzah/davey')` at process start and await it before the first `joinVoiceChannel` call, since it's a lazy dynamic import that could otherwise race the first Identify packet.

**Why:** This is easy to misdiagnose as a hosting/network/UDP limitation because the symptoms (stuck signalling, bot "visually" connected but no audio) look identical to real NAT/UDP-blocking issues. Always check for close code 4017 and the native binding before concluding it's an infra/network limitation.
