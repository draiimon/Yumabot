/**
 * Welcome card — exact HTML .card-bg + animations as 60fps MP4.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  ensureWelcomeFonts,
  getFontFamily,
  getOrbitronFont,
  getRajdhaniFont,
  getServerDisplayName,
} = require('./welcomeFonts');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const { probeFfmpeg, encodeFramesToMp4, withTempDir } = require('./welcomeVideoEncode');

const W = 860;
const CARD_H = 300;
const RADIUS = 20;
/** 1× = lighter pixels, faster encode + smoother 60fps GIF */
const SCALE = 1;
const OUT_W = W * SCALE;
const OUT_H = CARD_H * SCALE;

/** 10s animation timeline (HTML timing) */
const ANIM_LOOP_SEC = 10;
const LOOP_SEC = ANIM_LOOP_SEC;

/** GIF: 200 frames over 10s = 20fps smooth loop */
const GIF_FRAMES = 200;
const GIF_PLAYBACK_SEC = 10;
const GIF_DELAY_MS = Math.max(2, Math.round((GIF_PLAYBACK_SEC / GIF_FRAMES) * 1000));
const GIF_COLORS = 256;

/** Banner GIF: 30 frames over 5 seconds (~167ms/frame) — slower, smaller file */
const BANNER_GIF_FRAMES = 30;
const BANNER_GIF_PLAYBACK_SEC = 5;
const BANNER_GIF_DELAY_MS = Math.round((BANNER_GIF_PLAYBACK_SEC / BANNER_GIF_FRAMES) * 1000);

const MP4_RENDER_FPS = 24;
const MP4_LOOP_SEC = 3;
const MP4_FRAME_COUNT = MP4_LOOP_SEC * MP4_RENDER_FPS;
const OUT_PLAYBACK_FPS = 60;

const COLORS = {
  bg: '#050510',
  cyan: '#00e6ff',
  purple: '#a000ff',
  pink: '#ff00c8',
  green: '#00ff99',
  white: '#ffffff',
  muted: 'rgba(255,255,255,0.45)',
  msg: 'rgba(255,255,255,0.6)',
};

const PARTICLE_COLORS = [COLORS.cyan, COLORS.purple, COLORS.pink, COLORS.green];

function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function easeInOut(u) {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

/** HTML fade-in-up — only on first ~1.2s, then stays visible */
function fadeInUp(t, delay, duration = 0.7) {
  if (t >= delay + duration) return { opacity: 1, dy: 0 };
  if (t < delay) return { opacity: 0, dy: 12 };
  const u = (t - delay) / duration;
  const e = easeInOut(Math.min(1, Math.max(0, u)));
  return { opacity: e, dy: 12 * (1 - e) };
}

function pulse(t, period = 2.5) {
  return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2));
}

function barGlow(t) {
  return 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((t / 3) * Math.PI * 2));
}

/** HTML .card-bg — exact gradients */
function drawCardBackground(ctx) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, CARD_H);

  const g1 = ctx.createRadialGradient(W * 0.2, CARD_H / 2, 0, W * 0.2, CARD_H / 2, CARD_H * 0.7);
  g1.addColorStop(0, 'rgba(0,230,255,0.08)');
  g1.addColorStop(0.7, 'transparent');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, CARD_H);

  const g2 = ctx.createRadialGradient(W * 0.5, CARD_H / 2, 0, W * 0.5, CARD_H / 2, CARD_H * 0.7);
  g2.addColorStop(0, 'rgba(160,0,255,0.12)');
  g2.addColorStop(0.7, 'transparent');
  g2.addColorStop(1, 'transparent');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, CARD_H);

  const g3 = ctx.createLinearGradient(0, 0, W, CARD_H);
  g3.addColorStop(0, '#04041a');
  g3.addColorStop(1, '#060610');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, W, CARD_H);
}

function drawCorners(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,230,255,0.4)';
  ctx.lineWidth = 1;
  const pad = 8;
  const len = 20;
  for (const [x, y, dx, dy] of [
    [pad, pad, 1, 1],
    [W - pad, pad, -1, 1],
    [pad, CARD_H - pad, 1, -1],
    [W - pad, CARD_H - pad, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBottomBar(ctx, t) {
  ctx.save();
  ctx.globalAlpha = barGlow(t);
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, 'transparent');
  bar.addColorStop(0.25, COLORS.cyan);
  bar.addColorStop(0.5, COLORS.purple);
  bar.addColorStop(0.75, COLORS.pink);
  bar.addColorStop(1, 'transparent');
  ctx.fillStyle = bar;
  ctx.fillRect(0, CARD_H - 3, W, 3);
  ctx.restore();
}

function drawSpinRing(ctx, cx, cy, r, angle) {
  const x0 = cx + Math.cos(angle) * r;
  const y0 = cy + Math.sin(angle) * r;
  const x1 = cx + Math.cos(angle + Math.PI) * r;
  const y1 = cy + Math.sin(angle + Math.PI) * r;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, COLORS.cyan);
  grad.addColorStop(0.35, COLORS.purple);
  grad.addColorStop(0.65, COLORS.pink);
  grad.addColorStop(1, COLORS.cyan);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** HTML float-particle — rise ~120px over 3–7s */
function makeParticles() {
  return Array.from({ length: 12 }, (_, i) => ({
    x: Math.random() * W,
    y0: CARD_H * (0.55 + Math.random() * 0.35),
    duration: 3 + Math.random() * 4,
    delay: Math.random() * 5,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  }));
}

function drawFloatingParticles(ctx, particles, t) {
  for (const p of particles) {
    const lt = ((t - p.delay) % p.duration + p.duration) % p.duration;
    const u = lt / p.duration;
    let alpha = 0;
    let dy = 0;
    let scale = 0.5;
    if (u < 0.2) {
      alpha = u / 0.2;
      scale = alpha;
    } else if (u < 0.8) {
      alpha = 1;
      dy = -((u - 0.2) / 0.6) * 120;
      scale = 1 + (u - 0.2) * 0.6;
    } else {
      alpha = 0.6 * (1 - (u - 0.8) / 0.2);
      dy = -120 - ((u - 0.8) / 0.2) * 30;
      scale = 1.5;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y0 + dy, scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAvatar(ctx, avatarImg, cx, cy, r, t) {
  const pulseA = pulse(t, 2);
  ctx.save();
  ctx.globalAlpha = pulseA;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r + 18);
  glow.addColorStop(0, 'rgba(0,230,255,0.3)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 18 * (0.95 + 0.05 * pulseA), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const angle = -((t % 6) / 6) * Math.PI * 2;
  drawSpinRing(ctx, cx, cy, r + 12, angle);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
  } else {
    const fb = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    fb.addColorStop(0, '#1a1a3e');
    fb.addColorStop(1, '#2a0a4e');
    ctx.fillStyle = fb;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,230,255,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCardText(ctx, { username, serverName, t, mode, stayedFor, leaveTime }) {
  const isGoodbye = mode === 'goodbye';
  const textX = 200;
  const orbitron = getOrbitronFont();
  const rajdhani = getRajdhaniFont();
  const uiFont = getFontFamily();
  const centerY = CARD_H / 2;

  const accentColor  = isGoodbye ? COLORS.pink   : COLORS.cyan;
  const labelColor   = isGoodbye ? '#ff6b6b'      : COLORS.purple;
  const prefixColor  = isGoodbye ? COLORS.pink    : COLORS.cyan;
  const labelText    = isGoodbye ? 'FAREWELL'     : 'NEW MEMBER';
  const actionPrefix = isGoodbye ? 'Left '        : 'Joined ';
  const subText      = isGoodbye
    ? 'Thank you for being part of our community. You will be missed.'
    : 'Glad to have you here. Jump into the channels and get involved!';

  const ft = fadeInUp(t, 0.3, 0.6);
  const fn = fadeInUp(t, 0.5, 0.7);
  const fj = fadeInUp(t, 0.7, 0.7);
  const fm = fadeInUp(t, 0.9, 0.7);

  ctx.save();
  ctx.globalAlpha = ft.opacity;
  const labelY = centerY - 68 + ft.dy;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  const dx = textX, dy = labelY - 9, ds = 6;
  ctx.moveTo(dx, dy - ds);
  ctx.lineTo(dx + ds, dy);
  ctx.lineTo(dx, dy + ds);
  ctx.lineTo(dx - ds, dy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 20px "${rajdhani}", sans-serif`;
  ctx.fillStyle = labelColor;
  ctx.fillText(labelText, textX + 16, labelY);
  ctx.restore();

  let userFontSz = 54;
  ctx.font = `900 ${userFontSz}px "${orbitron}", sans-serif`;
  while (ctx.measureText(username).width > 420 && userFontSz > 24) {
    userFontSz -= 1;
    ctx.font = `900 ${userFontSz}px "${orbitron}", sans-serif`;
  }
  const nameW = ctx.measureText(username).width;

  ctx.save();
  ctx.globalAlpha = fn.opacity;
  ctx.fillStyle = COLORS.white;
  ctx.fillText(username, textX, centerY - 16 + fn.dy);
  if (fn.opacity >= 1 && Math.floor(t) % 1 < 0.5) {
    ctx.fillStyle = accentColor;
    ctx.fillRect(textX + nameW + 3, centerY - 16 + fn.dy - userFontSz * 0.75, 3, userFontSz * 0.85);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fj.opacity;
  if (isGoodbye) {
    ctx.font = `500 26px "${rajdhani}", sans-serif`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('has left the server.', textX, centerY + 30 + fj.dy);
  } else {
    ctx.font = `500 28px "${rajdhani}", sans-serif`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(actionPrefix, textX, centerY + 30 + fj.dy);
    const prefixW = ctx.measureText(actionPrefix).width;
    ctx.font = `700 28px "${uiFont}", "${orbitron}", sans-serif`;
    ctx.fillStyle = prefixColor;
    ctx.fillText(serverName, textX + prefixW, centerY + 30 + fj.dy);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fm.opacity;
  ctx.font = `400 22px "${rajdhani}", sans-serif`;
  ctx.fillStyle = COLORS.msg;
  if (isGoodbye) {
    ctx.fillText(stayedFor || '', textX, centerY + 66 + fm.dy, 420);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `400 18px "${rajdhani}", sans-serif`;
    ctx.fillText(leaveTime || '', textX, centerY + 94 + fm.dy);
  } else {
    ctx.fillText(subText, textX, centerY + 72 + fm.dy, 420);
  }
  ctx.restore();
}

function drawHexBadge(ctx, memberCount, t) {
  const bx = W - 90;
  const by = CARD_H / 2 + 80;
  const br = 44;
  const fh = fadeInUp(t, 1.0, 0.7);

  ctx.save();
  ctx.globalAlpha = fh.opacity;
  hexPath(ctx, bx, by, br);
  ctx.fillStyle = 'rgba(0,230,255,0.05)';
  ctx.fill();
  const stroke = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  stroke.addColorStop(0, COLORS.cyan);
  stroke.addColorStop(0.5, COLORS.purple);
  stroke.addColorStop(1, COLORS.pink);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  const orbitron = getOrbitronFont();
  const rajdhani = getRajdhaniFont();
  ctx.font = `700 19px "${orbitron}", sans-serif`;
  ctx.fillStyle = COLORS.green;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`#${Number(memberCount).toLocaleString()}`, bx, by - 6);
  ctx.font = `400 13px "${rajdhani}", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('member', bx, by + 16);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawPgLogo(ctx, logoImg, t) {
  if (!logoImg) return;
  const lx = W - 90;
  const ly = CARD_H / 2 - 65;
  const lr = 55;
  const fl = fadeInUp(t, 0.8, 0.7);

  ctx.save();
  ctx.globalAlpha = fl.opacity;

  // glow ring behind logo
  const glow = ctx.createRadialGradient(lx, ly, lr * 0.4, lx, ly, lr + 10);
  glow.addColorStop(0, 'rgba(0,230,255,0.18)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lx, ly, lr + 10, 0, Math.PI * 2);
  ctx.fill();

  // circular clip + draw logo
  ctx.beginPath();
  ctx.arc(lx, ly, lr, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logoImg, lx - lr, ly - lr, lr * 2, lr * 2);
  ctx.restore();

  // border ring
  ctx.save();
  ctx.globalAlpha = fl.opacity * 0.7;
  ctx.beginPath();
  ctx.arc(lx, ly, lr, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(lx - lr, ly - lr, lx + lr, ly + lr);
  ring.addColorStop(0, COLORS.cyan);
  ring.addColorStop(0.5, COLORS.purple);
  ring.addColorStop(1, COLORS.pink);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawCardFrame(ctx, state, t) {
  const avatarCx = 110;
  const avatarCy = CARD_H / 2;

  drawCardBackground(ctx);
  drawFloatingParticles(ctx, state.particles, t);
  drawCorners(ctx);
  drawBottomBar(ctx, t);

  ctx.save();
  roundRectPath(ctx, 0.5, 0.5, W - 1, CARD_H - 1, RADIUS);
  ctx.strokeStyle = 'rgba(160,0,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  drawAvatar(ctx, state.avatarImg, avatarCx, avatarCy, 65, t);
  drawCardText(ctx, {
    username: state.username,
    serverName: state.displayServer,
    t,
    mode: state.mode,
    stayedFor: state.stayedFor,
    leaveTime: state.leaveTime,
  });
  drawPgLogo(ctx, state.pgLogoImg, t);
  drawHexBadge(ctx, state.memberCount, t);
}

function paintFrame(ctx, state, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, OUT_W, OUT_H);
  ctx.scale(SCALE, SCALE);
  ctx.save();
  roundRectPath(ctx, 0, 0, W, CARD_H, RADIUS);
  ctx.clip();
  drawCardFrame(ctx, state, t);
  ctx.restore();
}

const PG_LOGO_PATH = path.join(__dirname, 'pg-logo.png');

async function buildWelcomeState({ avatarURL, username, serverName, memberCount, mode, stayedFor, leaveTime }) {
  await ensureWelcomeFonts();
  const [avatarImg, pgLogoImg] = await Promise.all([
    avatarURL ? loadImage(avatarURL).catch(() => null) : Promise.resolve(null),
    loadImage(PG_LOGO_PATH).catch(() => null),
  ]);
  return {
    avatarImg,
    pgLogoImg,
    particles: makeParticles(),
    username,
    displayServer: getServerDisplayName(serverName),
    memberCount,
    mode: mode || 'welcome',
    stayedFor: stayedFor || '',
    leaveTime: leaveTime || '',
  };
}

async function renderFrameSequence(state, frameCount, loopSec) {
  const canvas = createCanvas(OUT_W, OUT_H);
  const ctx = canvas.getContext('2d');
  const rgbaFrames = [];
  for (let i = 0; i < frameCount; i++) {
    const t = (i / frameCount) * loopSec;
    paintFrame(ctx, state, t);
    rgbaFrames.push(ctx.getImageData(0, 0, OUT_W, OUT_H).data);
  }
  return rgbaFrames;
}

function encodeGifFromFrames(rgbaFrames) {
  const gif = GIFEncoder();
  const mid = rgbaFrames[Math.floor(rgbaFrames.length / 2)];
  const palette = quantize(mid, GIF_COLORS);
  for (const data of rgbaFrames) {
    const index = applyPalette(data, palette);
    gif.writeFrame(index, OUT_W, OUT_H, { palette, delay: GIF_DELAY_MS, dispose: 2 });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

/** Lighter GIF — 860×200, 60fps-style playback (fallback when ffmpeg missing). */
async function generateWelcomeGif(opts) {
  const state = await buildWelcomeState(opts);
  const frames = await renderFrameSequence(state, GIF_FRAMES, ANIM_LOOP_SEC);
  return encodeGifFromFrames(frames);
}

/** 60fps MP4 when a working ffmpeg is available. */
async function generateWelcomeVideo(opts) {
  const ffmpeg = await probeFfmpeg();
  if (!ffmpeg) throw new Error('ffmpeg not available');

  const state = await buildWelcomeState(opts);
  const canvas = createCanvas(OUT_W, OUT_H);
  const ctx = canvas.getContext('2d');

  return withTempDir(async (tmpDir) => {
    for (let i = 0; i < MP4_FRAME_COUNT; i++) {
      const t = (i / MP4_FRAME_COUNT) * ANIM_LOOP_SEC;
      paintFrame(ctx, state, t);
      const png = await canvas.encode('png');
      await fs.promises.writeFile(
        path.join(tmpDir, `frame_${String(i).padStart(5, '0')}.png`),
        png
      );
    }
    return encodeFramesToMp4(
      tmpDir,
      MP4_FRAME_COUNT,
      { loopSec: MP4_LOOP_SEC, outFps: OUT_PLAYBACK_FPS, crf: 20 },
      ffmpeg
    );
  });
}

/** Always GIF — smooth 20fps loop, no MP4. */
async function generateWelcomeAttachment(opts) {
  const buffer = await generateWelcomeGif(opts);
  const filename = opts.mode === 'goodbye' ? 'goodbye.gif' : 'welcome.gif';
  return { buffer, filename, format: 'gif' };
}

// ─── Channel Banner ───────────────────────────────────────────────────────────
const BANNER_H = 180;
const BANNER_FRAMES = 120;
const BANNER_LOOP_SEC = 8;
const BANNER_DELAY_MS = Math.max(2, Math.round((BANNER_LOOP_SEC / BANNER_FRAMES) * 1000));

function drawBannerBg(ctx, accentHex) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, BANNER_H);

  const g1 = ctx.createRadialGradient(W * 0.15, BANNER_H / 2, 0, W * 0.15, BANNER_H / 2, BANNER_H * 1.1);
  g1.addColorStop(0, 'rgba(0,230,255,0.10)');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, BANNER_H);

  const g2 = ctx.createRadialGradient(W * 0.55, BANNER_H / 2, 0, W * 0.55, BANNER_H / 2, BANNER_H * 1.2);
  g2.addColorStop(0, 'rgba(160,0,255,0.14)');
  g2.addColorStop(1, 'transparent');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, BANNER_H);

  const g3 = ctx.createLinearGradient(0, 0, W, BANNER_H);
  g3.addColorStop(0, '#04041a');
  g3.addColorStop(1, '#060614');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, W, BANNER_H);
}

function drawBannerBar(ctx, t) {
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((t / 3) * Math.PI * 2));
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, 'transparent');
  bar.addColorStop(0.2, COLORS.cyan);
  bar.addColorStop(0.5, COLORS.purple);
  bar.addColorStop(0.8, COLORS.pink);
  bar.addColorStop(1, 'transparent');
  ctx.fillStyle = bar;
  ctx.fillRect(0, BANNER_H - 3, W, 3);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin((t / 2.5) * Math.PI * 2));
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 2);
  ctx.restore();
}

function drawBannerCorners(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,230,255,0.45)';
  ctx.lineWidth = 1.5;
  const pad = 10, len = 18;
  for (const [x, y, dx, dy] of [
    [pad, pad, 1, 1],
    [W - pad, pad, -1, 1],
    [pad, BANNER_H - pad, 1, -1],
    [W - pad, BANNER_H - pad, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBannerParticles(ctx, particles, t) {
  for (const p of particles) {
    const lt = ((t - p.delay) % p.duration + p.duration) % p.duration;
    const u = lt / p.duration;
    let alpha = 0, dy = 0, scale = 0.5;
    if (u < 0.2) { alpha = u / 0.2; scale = alpha; }
    else if (u < 0.8) { alpha = 1; dy = -((u - 0.2) / 0.6) * 80; scale = 1 + (u - 0.2) * 0.4; }
    else { alpha = 0.6 * (1 - (u - 0.8) / 0.2); dy = -80; scale = 1.4; }
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y0 + dy, scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBannerContent(ctx, { title, subtitle, accentHex, pgLogoImg, t }) {
  const orbitron = getOrbitronFont();
  const rajdhani = getRajdhaniFont();
  const accent = accentHex || COLORS.cyan;
  const cy = BANNER_H / 2;

  // Logo on the left
  if (pgLogoImg) {
    const lr = 48, lx = 70, ly = cy;
    const fl = Math.min(1, t / 0.8);
    ctx.save();
    ctx.globalAlpha = fl * 0.9;
    const glow = ctx.createRadialGradient(lx, ly, lr * 0.3, lx, ly, lr + 8);
    glow.addColorStop(0, 'rgba(0,230,255,0.2)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, lr + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(pgLogoImg, lx - lr, ly - lr, lr * 2, lr * 2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fl * 0.6;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    const ring = ctx.createLinearGradient(lx - lr, ly - lr, lx + lr, ly + lr);
    ring.addColorStop(0, COLORS.cyan);
    ring.addColorStop(0.5, COLORS.purple);
    ring.addColorStop(1, COLORS.pink);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Accent diamond + label tag
  const tagX = 148;
  const titleFade = Math.min(1, Math.max(0, (t - 0.2) / 0.6));
  const subFade   = Math.min(1, Math.max(0, (t - 0.5) / 0.6));

  ctx.save();
  ctx.globalAlpha = titleFade;

  // small accent tag above title
  ctx.fillStyle = accent;
  ctx.beginPath();
  const ds = 5;
  ctx.moveTo(tagX, cy - 50 - ds);
  ctx.lineTo(tagX + ds, cy - 50);
  ctx.lineTo(tagX, cy - 50 + ds);
  ctx.lineTo(tagX - ds, cy - 50);
  ctx.closePath();
  ctx.fill();

  ctx.font = `700 16px "${rajdhani}", sans-serif`;
  ctx.fillStyle = accent;
  ctx.fillText('PLAY GROUND', tagX + 12, cy - 46);

  // divider line
  ctx.globalAlpha = titleFade * 0.4;
  ctx.fillStyle = accent;
  ctx.fillRect(tagX, cy - 34, 500, 1);
  ctx.restore();

  // Main title
  let titleSize = 52;
  ctx.font = `900 ${titleSize}px "${orbitron}", sans-serif`;
  while (ctx.measureText(title).width > 620 && titleSize > 26) {
    titleSize -= 2;
    ctx.font = `900 ${titleSize}px "${orbitron}", sans-serif`;
  }
  ctx.save();
  ctx.globalAlpha = titleFade;
  // glow behind title
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18 * (0.7 + 0.3 * Math.sin(t * 1.5));
  ctx.fillStyle = COLORS.white;
  ctx.fillText(title, tagX, cy + titleSize * 0.35);
  ctx.restore();

  // Subtitle
  if (subtitle) {
    ctx.save();
    ctx.globalAlpha = subFade * 0.7;
    ctx.font = `500 20px "${rajdhani}", sans-serif`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(subtitle, tagX, cy + titleSize * 0.35 + 34);
    ctx.restore();
  }

  // Animated side accent line
  const lineProgress = Math.min(1, t / 1.2);
  ctx.save();
  ctx.globalAlpha = 0.6;
  const lineGrad = ctx.createLinearGradient(tagX, 0, tagX + 500 * lineProgress, 0);
  lineGrad.addColorStop(0, accent);
  lineGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tagX, cy + titleSize * 0.35 + 48);
  ctx.lineTo(tagX + 500 * lineProgress, cy + titleSize * 0.35 + 48);
  ctx.stroke();
  ctx.restore();
}

function paintBannerFrame(ctx, state, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, BANNER_H);
  ctx.save();
  roundRectPath(ctx, 0, 0, W, BANNER_H, RADIUS);
  ctx.clip();
  drawBannerBg(ctx, state.accentHex);
  drawBannerParticles(ctx, state.particles, t);
  drawBannerCorners(ctx);
  drawBannerBar(ctx, t);
  ctx.save();
  roundRectPath(ctx, 0.5, 0.5, W - 1, BANNER_H - 1, RADIUS);
  ctx.strokeStyle = 'rgba(160,0,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  drawBannerContent(ctx, { ...state, t });
  ctx.restore();
}

/**
 * Generate a channel header banner GIF — same theme as welcome/goodbye.
 * @param {{ title: string, subtitle?: string, accentHex?: string, filename?: string }} opts
 */
async function generateChannelBanner(opts) {
  await ensureWelcomeFonts();
  const pgLogoImg = await loadImage(PG_LOGO_PATH).catch(() => null);
  const particles = Array.from({ length: 14 }, (_, i) => ({
    x: Math.random() * W,
    y0: BANNER_H * (0.5 + Math.random() * 0.45),
    duration: 3 + Math.random() * 4,
    delay: Math.random() * 5,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  }));
  const state = {
    title: opts.title,
    subtitle: opts.subtitle || '',
    accentHex: opts.accentHex || COLORS.cyan,
    pgLogoImg,
    particles,
  };
  const canvas = createCanvas(W, BANNER_H);
  const ctx = canvas.getContext('2d');
  const rgbaFrames = [];
  for (let i = 0; i < BANNER_FRAMES; i++) {
    const t = (i / BANNER_FRAMES) * BANNER_LOOP_SEC;
    paintBannerFrame(ctx, state, t);
    rgbaFrames.push(ctx.getImageData(0, 0, W, BANNER_H).data);
  }
  const gif = GIFEncoder();
  const mid = rgbaFrames[Math.floor(rgbaFrames.length / 2)];
  const palette = quantize(mid, GIF_COLORS);
  for (const data of rgbaFrames) {
    const index = applyPalette(data, palette);
    gif.writeFrame(index, W, BANNER_H, { palette, delay: BANNER_DELAY_MS, dispose: 2 });
  }
  gif.finish();
  const buffer = Buffer.from(gif.bytes());
  return { buffer, filename: opts.filename || 'banner.gif' };
}

/** Sharp PNG snapshot (HTML background, no compression banding) */
async function generateWelcomePng(opts) {
  await ensureWelcomeFonts();
  const displayServer = getServerDisplayName(opts.serverName);
  let avatarImg = null;
  if (opts.avatarURL) {
    try {
      avatarImg = await loadImage(opts.avatarURL);
    } catch {
      /* */
    }
  }
  const state = {
    avatarImg,
    particles: makeParticles(),
    username: opts.username,
    displayServer,
    memberCount: opts.memberCount,
  };
  const canvas = createCanvas(OUT_W, OUT_H);
  const ctx = canvas.getContext('2d');
  paintFrame(ctx, state, LOOP_SEC * 0.85);
  return canvas.encode('png');
}

const SMALL_CAPS_MAP = {
  'ᴀ':'A','ʙ':'B','ᴄ':'C','ᴅ':'D','ᴇ':'E','ꜰ':'F','ɢ':'G','ʜ':'H','ɪ':'I','ᴊ':'J',
  'ᴋ':'K','ʟ':'L','ᴍ':'M','ɴ':'N','ᴏ':'O','ᴘ':'P','ǫ':'Q','ʀ':'R','ꜱ':'S','ᴛ':'T',
  'ᴜ':'U','ᴠ':'V','ᴡ':'W','ʏ':'Y','ᴢ':'Z',
};

function sanitizeCanvasText(text) {
  return String(text).replace(/./gu, (ch) => SMALL_CAPS_MAP[ch] ?? ch);
}

function paintRoleMenuBannerFrame(ctx, { particles, sectionTitle, serverName, orbitron, rajdhani }, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, OUT_W, OUT_H);
  ctx.scale(SCALE, SCALE);
  ctx.save();
  roundRectPath(ctx, 0, 0, W, CARD_H, RADIUS);
  ctx.clip();

  drawCardBackground(ctx);
  drawFloatingParticles(ctx, particles, t);
  drawCorners(ctx);
  drawBottomBar(ctx, t);

  const safeServer = sanitizeCanvasText(getServerDisplayName(serverName));
  const safeTitle = sanitizeCanvasText(sectionTitle);
  const hasServer = safeServer.length > 0;
  const centerY = CARD_H / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (hasServer) {
    ctx.font = `500 11px "${rajdhani}", sans-serif`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(safeServer, W / 2, centerY - 22);
  }

  if (safeTitle) {
    let fontSize = 28;
    ctx.font = `900 ${fontSize}px "${orbitron}", sans-serif`;
    while (ctx.measureText(safeTitle).width > W - 100 && fontSize > 14) {
      fontSize -= 1;
      ctx.font = `900 ${fontSize}px "${orbitron}", sans-serif`;
    }
    const grad = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, 0);
    grad.addColorStop(0, COLORS.cyan);
    grad.addColorStop(0.45, COLORS.purple);
    grad.addColorStop(1, COLORS.pink);
    ctx.fillStyle = grad;
    ctx.fillText(safeTitle, W / 2, centerY + (hasServer ? 10 : 0));
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Animated GIF banner using neon design (particles + bottom bar).
 * Used as embed banner images in role-menu messages.
 */
async function generateRoleMenuBannerGif({ sectionTitle = '', serverName = '' } = {}) {
  await ensureWelcomeFonts();
  const particles = makeParticles();
  const orbitron = getOrbitronFont();
  const rajdhani = getRajdhaniFont();
  const canvas = createCanvas(OUT_W, OUT_H);
  const ctx = canvas.getContext('2d');
  const rgbaFrames = [];

  for (let i = 0; i < BANNER_GIF_FRAMES; i++) {
    const t = (i / BANNER_GIF_FRAMES) * LOOP_SEC;
    paintRoleMenuBannerFrame(ctx, { particles, sectionTitle, serverName, orbitron, rajdhani }, t);
    rgbaFrames.push(ctx.getImageData(0, 0, OUT_W, OUT_H).data);
  }

  const gif = GIFEncoder();
  const mid = rgbaFrames[Math.floor(rgbaFrames.length / 2)];
  const palette = quantize(mid, GIF_COLORS);
  for (const data of rgbaFrames) {
    const index = applyPalette(data, palette);
    gif.writeFrame(index, OUT_W, OUT_H, { palette, delay: BANNER_GIF_DELAY_MS, dispose: 2 });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

module.exports = {
  generateWelcomeAttachment,
  generateWelcomeVideo,
  generateWelcomePng,
  generateWelcomeGif,
  generateChannelBanner,
  generateWelcomeImage: generateWelcomeGif,
  generateWelcomeGifs: async (opts) => ({ cardGif: await generateWelcomeGif(opts) }),
  generateRoleMenuBannerGif,
  LOOP_SEC,
  ANIM_LOOP_MS: GIF_DELAY_MS,
  ANIM_LOOP_SEC,
  GIF_FRAMES,
  GIF_PLAYBACK_SEC,
  GIF_DELAY_MS,
  OUT_PLAYBACK_FPS,
  OUT_W,
  OUT_H,
};
