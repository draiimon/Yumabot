const { toSmallCaps, fromSmallCaps } = require('./smallCaps');

/**
 * Actual Discord role name — plain ASCII so @valor / @roblox search works.
 * (Small-caps Unicode breaks Discord's role mention picker.)
 */
function getRoleDiscordName(entry) {
  return String(entry.roleName).slice(0, 100);
}

/** @deprecated alias — use getRoleDiscordName */
function getRoleDisplayName(entry) {
  return getRoleDiscordName(entry);
}

/** Embed / UI label — small caps aesthetic (not used as Discord role.name). */
function getRoleEmbedLabel(entry) {
  return toSmallCaps(entry.roleName).slice(0, 100);
}

/** Match role whether it was renamed to small-caps or plain. */
function roleNameMatchesEntry(roleName, entry) {
  const want = String(entry.roleName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const candidates = [
    String(roleName).toLowerCase().replace(/[^a-z0-9]+/g, ''),
    fromSmallCaps(roleName).toLowerCase().replace(/[^a-z0-9]+/g, ''),
  ];
  return candidates.some((c) => c === want);
}

/** Per-role colors (Discord role color integer). */
const ROLE_COLORS = {
  age_17: 0x57f287,
  age_18_24: 0x5865f2,
  age_25_30: 0xfee75c,
  age_30p: 0xeb459e,
  rel_single: 0x99aab5,
  rel_taken: 0xed4245,
  rel_complicated: 0x9b59b6,
  bumper: 0xfaa61a,
  g_valorant: 0xff4655,
  g_roblox: 0xe2231a,
  g_minecraft: 0x62a84f,
  g_wuwa: 0x7eb6ff,
  g_dota2: 0xb8242a,
  g_dbdl: 0x8b0000,
  g_ow: 0xf99e1a,
  g_ml: 0x1e90ff,
  g_lol: 0xc89b3c,
  g_aram: 0x1abc9c,
  g_tft: 0x9b59b6,
  g_genshin: 0xffd700,
  g_wr: 0x00b4d8,
  g_marvel: 0xdc143c,
  g_hsr: 0x6c5ce7,
  g_l4d: 0x2ecc71,
  g_hok: 0xd4af37,
  g_repo: 0x95a5a6,
  g_elsword: 0xe74c3c,
  g_aov: 0xc0392b,
  g_stardew: 0x27ae60,
  g_phasmo: 0x34495e,
  g_fortnite: 0x9b59b6,
  g_pubg: 0xf39c12,
  g_pokemon: 0x3498db,
  g_brawlhalla: 0xe67e22,
  g_albion: 0xb7950b,
  g_codm: 0x2c3e50,
  g_heartopia: 0xff69b4,
  g_pc: 0x7289da,
  g_console: 0x9b59b6,
  g_phone: 0x1abc9c,
};

const DEFAULT_COLOR = 0x99aab5;

function getRoleColor(entryKey) {
  return ROLE_COLORS[entryKey] ?? DEFAULT_COLOR;
}

module.exports = {
  getRoleDiscordName,
  getRoleDisplayName,
  getRoleEmbedLabel,
  roleNameMatchesEntry,
  getRoleColor,
  ROLE_COLORS,
  toSmallCaps,
  fromSmallCaps,
};
