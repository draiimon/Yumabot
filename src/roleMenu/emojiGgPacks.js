const axios = require('axios');

const CDN = 'https://cdn3.emoji.gg/emojis/';
let packsCache = null;
let packsCacheAt = 0;
const CACHE_MS = 30 * 60 * 1000;

/** Pack slug + filename preferences per role key */
const ENTRY_PACKS = {
  g_valorant: { slug: '533706-valorant', prefer: ['valorant-raze-icon', 'valorant-phoenix-icon', 'valorant'], avoid: ['agentmiks', 'neon', 'jett'] },
  g_minecraft: { slug: '777022-minecraft', prefer: ['minecraft', 'grass', 'block'], avoid: ['bread', 'gif', 'cat'] },
  g_roblox: { slug: null, prefer: ['roblox'], avoid: ['joy', 'mad', 'pump', 'wight'] },
  g_lol: { slug: '465305-league-of-legends', prefer: ['lol.png', 'lol'], avoid: ['losers', 'rocket'] },
  g_aram: { slug: '465305-league-of-legends', prefer: ['lol'], avoid: [] },
  g_tft: { slug: '465305-league-of-legends', prefer: ['lol'], avoid: [] },
  g_wr: { slug: '465305-league-of-legends', prefer: ['lol', 'wild'], avoid: [] },
  g_genshin: { slug: '364035-genshin', prefer: ['genshin', 'logo', 'impact'], avoid: ['venti', 'uwu', 'hug'] },
  g_fortnite: { slug: null, prefer: ['fortnitelogo', 'fortnite'], avoid: ['llama', 'bear', 'flip'] },
  g_pubg: { slug: null, prefer: ['pubg'], avoid: [] },
  g_ow: { slug: null, prefer: ['overwatch'], avoid: [] },
  g_dota2: { slug: null, prefer: ['dota'], avoid: [] },
  g_stardew: { slug: null, prefer: ['stardewvalley', 'stardew'], avoid: ['chicken', 'quest'] },
  g_pokemon: { slug: null, prefer: ['pokemon'], avoid: ['trainer', 'poker'] },
  g_marvel: { slug: null, prefer: ['marvel'], avoid: [] },
  g_pc: { slug: '765161-steamlord', prefer: ['steam'], avoid: ['tada', 'gif'] },
  g_console: { slug: null, prefer: ['xboxlogo', 'playstation', 'controller'], avoid: [] },
  g_phone: { slug: null, prefer: ['phone', 'mobile'], avoid: ['steam', 'password'] },
};

const BLOCKLIST = /loli|lewd|nsfw|porn|titty|nude/i;

/** Exact PNG filenames from emoji.gg packs (square game/role icons) */
const DIRECT_FILES = {
  g_valorant: '771411-valorant.png',
  g_minecraft: '4013_minecraftegg.png',
  g_lol: '149722-lol.png',
  g_fortnite: 'FortniteLogo.png',
  g_pubg: 'pubg.png',
  g_ow: 'overwatch.png',
  g_stardew: 'StardewValley.png',
  g_marvel: 'Marvel.png',
  g_roblox: 'RobloxianDiscord.png',
  g_dbdl: 'bd.png',
};

/** Prefer PNG logos from emoji.gg global CDN by exact slug (no 5000-emoji download). */
const GLOBAL_SLUG_FILES = {
  g_genshin: null,
  g_wuwa: null,
  g_ml: null,
  g_phasmo: null,
  g_repo: null,
  g_albion: null,
  g_codm: null,
  g_heartopia: null,
  g_hok: null,
  g_aov: null,
  g_elsword: null,
};

function usesTwemojiOnly(entry) {
  return /^(age_|rel_|bumper)/.test(entry.key);
}

async function loadPacks() {
  if (packsCache && Date.now() - packsCacheAt < CACHE_MS) return packsCache;
  const res = await axios.get('https://emoji.gg/api/packs', {
    timeout: 60000,
    headers: { 'User-Agent': 'JanJanBot/1.0' },
  });
  packsCache = res.data;
  packsCacheAt = Date.now();
  return packsCache;
}

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function packFiles(pack) {
  return String(pack?.emojis || '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

function scoreFile(file, prefer = [], avoid = [], label = '') {
  const f = file.toLowerCase();
  const fn = norm(file.replace(/\.(png|gif|webp|jpg)$/i, ''));
  let score = 0;
  if (!f.endsWith('.png')) score -= 15;
  if (f.endsWith('.gif')) score -= 10;
  if (BLOCKLIST.test(f)) return -999;

  for (const a of avoid) {
    if (fn.includes(norm(a))) score -= 40;
  }
  for (const p of prefer) {
    const pn = norm(p);
    if (fn === pn || f === p) score += 100;
    else if (fn.includes(pn)) score += 60;
  }
  if (label && fn.includes(norm(label))) score += 30;
  // square icon heuristic: "icon", "logo" in name
  if (/icon|logo|symbol/i.test(f)) score += 20;
  // penalize long meme names
  if (fn.length > 28) score -= 10;
  return score;
}

function findPackBySlug(packs, slug) {
  if (!slug) return null;
  return packs.find((p) => p.slug === slug || String(p.id) === String(slug));
}

function findPackByKeyword(packs, keyword) {
  const k = norm(keyword);
  return packs.find((p) => norm(p.slug).includes(k) || norm(p.name).includes(k));
}

function pickBestFile(files, prefer, avoid, label) {
  const ranked = files
    .map((file) => ({ file, score: scoreFile(file, prefer, avoid, label) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.file || null;
}

/**
 * Resolve a square PNG/GIF URL from emoji.gg pack for a role entry.
 */
async function resolveEmojiGgPackUrl(entry) {
  if (usesTwemojiOnly(entry)) return null;

  if (DIRECT_FILES[entry.key]) {
    return { url: `${CDN}${DIRECT_FILES[entry.key]}`, source: 'direct', file: DIRECT_FILES[entry.key] };
  }
  if (GLOBAL_SLUG_FILES[entry.key]) {
    const file = GLOBAL_SLUG_FILES[entry.key];
    if (file) {
      return { url: `${CDN}${file}`, source: 'global-slug', file };
    }
  }

  const packs = await loadPacks();
  const cfg = ENTRY_PACKS[entry.key] || {};
  const prefer = [...(cfg.prefer || []), norm(entry.roleName)].filter((x) => x.length >= 4);
  const avoid = cfg.avoid || [];

  let pack = findPackBySlug(packs, cfg.slug);
  if (!pack && cfg.slug === null && ENTRY_PACKS[entry.key]) {
    return null;
  }
  if (!pack && !ENTRY_PACKS[entry.key]) {
    pack = findPackByKeyword(packs, entry.label);
  }

  if (pack) {
    const file = pickBestFile(packFiles(pack), prefer, avoid, entry.label);
    if (file) {
      return { url: `${CDN}${file}`, source: `pack:${pack.slug}`, file };
    }
  }

  return null;
}

/**
 * Fallback: search global emoji.gg list (cached) for logo-like PNG.
 */
let globalCache = null;
async function loadGlobalEmojis() {
  if (globalCache) return globalCache;
  const res = await axios.get('https://emoji.gg/api', {
    timeout: 60000,
    headers: { 'User-Agent': 'JanJanBot/1.0' },
  });
  globalCache = res.data;
  return globalCache;
}

async function resolveEmojiGgGlobalUrl(entry) {
  if (usesTwemojiOnly(entry)) return null;
  const list = await loadGlobalEmojis();
  const prefer = [norm(entry.label), norm(entry.roleName), ...(ENTRY_PACKS[entry.key]?.prefer || [])].filter(
    (x) => x.length >= 3,
  );
  const avoid = ENTRY_PACKS[entry.key]?.avoid || [];

  const ranked = list
    .map((item) => {
      const title = `${item.title} ${item.slug}`;
      let score = 0;
      if (!item.image?.includes('.png')) score -= 20;
      if (item.image?.includes('.gif')) score -= 5;
      if (BLOCKLIST.test(title)) return { item, score: -999 };
      for (const p of prefer) {
        if (norm(title).includes(p)) score += 50;
      }
      for (const a of avoid) {
        if (norm(title).includes(norm(a))) score -= 40;
      }
      if (/logo|icon/i.test(title)) score += 25;
      return { item, score };
    })
    .filter((x) => x.score >= 45)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.item;
  if (best?.image) {
    return { url: best.image, source: 'global', file: best.slug };
  }
  return null;
}

async function resolveEmojiGgIconUrl(entry) {
  if (usesTwemojiOnly(entry)) return null;
  const fromPack = await resolveEmojiGgPackUrl(entry);
  if (fromPack) return fromPack;
  return null;
}

/** Call once before batch upload (fast, ~100 packs only). */
async function warmUpEmojiGg() {
  console.log('[ROLE-MENU] Loading emoji.gg packs…');
  await loadPacks();
  console.log('[ROLE-MENU] emoji.gg packs ready.');
}

module.exports = {
  resolveEmojiGgIconUrl,
  resolveEmojiGgPackUrl,
  warmUpEmojiGg,
  ENTRY_PACKS,
  CDN,
};
