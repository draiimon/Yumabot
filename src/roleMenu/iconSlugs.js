/** Simple Icons slug or special download URL per role-menu key */
const ICON_SLUGS = {
  g_valorant: 'valorant',
  g_roblox: 'roblox',
  g_minecraft: 'minecraft',
  g_wuwa: null,
  g_dota2: 'dota2',
  g_dbdl: null,
  g_ow: 'overwatch',
  g_ml: null,
  g_lol: 'leagueoflegends',
  g_aram: 'leagueoflegends',
  g_tft: 'teamfighttactics',
  g_genshin: null,
  g_wr: 'riotgames',
  g_marvel: null,
  g_hsr: null,
  g_l4d: null,
  g_hok: null,
  g_repo: null,
  g_elsword: null,
  g_aov: null,
  g_stardew: null,
  g_phasmo: null,
  g_fortnite: 'fortnite',
  g_pubg: 'pubg',
  g_pokemon: 'pokemon',
  g_brawlhalla: null,
  g_albion: null,
  g_codm: 'activision',
  g_heartopia: null,
  g_pc: null,
  g_console: null,
  g_phone: null,
};

/** Steam capsule icons (official artwork) where Simple Icons has no entry */
const STEAM_CAPSULE = {
  g_wuwa: 3167020,
  g_dbdl: 381210,
  g_genshin: 1926970,
  g_hsr: 1926970,
  g_l4d: 500,
  g_stardew: 413150,
  g_phasmo: 739630,
  g_marvel: 2767030,
  g_brawlhalla: 291550,
  g_albion: 761890,
  g_repo: 3241660,
};

const STEAM_URL = (id) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/capsule_184x69.jpg`;

module.exports = { ICON_SLUGS, STEAM_CAPSULE, STEAM_URL };
