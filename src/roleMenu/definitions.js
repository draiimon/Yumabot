/**
 * Role menu definitions — emoji icons match reaction keys.
 * Groups: age & relationship = single-select; games = multi-select.
 */

const AGE = [
  { key: 'age_17', label: '17', emoji: '🧒', roleName: '17' },
  { key: 'age_18_24', label: '18–24', emoji: '🧑', roleName: '18-24' },
  { key: 'age_25_30', label: '25–30', emoji: '👨', roleName: '25-30' },
  { key: 'age_30p', label: '30+', emoji: '🧔‍♂️', roleName: '30+' },
];

const RELATIONSHIP = [
  { key: 'rel_single', label: 'Single', emoji: '🧍', roleName: 'Single' },
  { key: 'rel_taken', label: 'In a Relationship', emoji: '💑', roleName: 'In a Relationship' },
  { key: 'rel_complicated', label: 'Complicated', emoji: '❤️‍🩹', roleName: 'Complicated' },
];

/** Max ~11 per message — Discord allows 20 reactions per message. */
const GAMES_A = [
  { key: 'g_valorant', label: 'Valorant', emoji: '🎯', iconSlug: 'valorant', roleName: 'Valorant' },
  { key: 'g_roblox', label: 'Roblox', emoji: '🧱', iconSlug: 'roblox', roleName: 'Roblox' },
  { key: 'g_minecraft', label: 'Minecraft', emoji: '⛏️', iconSlug: 'minecraft', roleName: 'Minecraft' },
  { key: 'g_wuwa', label: 'Wuthering Waves', emoji: '🌊', roleName: 'Wuthering Waves' },
  { key: 'g_dota2', label: 'DOTA 2', emoji: '⚔️', iconSlug: 'dota2', roleName: 'DOTA 2' },
  { key: 'g_dbdl', label: 'Dead by Daylight', emoji: '🔪', roleName: 'Dead by Daylight' },
  { key: 'g_ow', label: 'Overwatch', emoji: '🦸', iconSlug: 'overwatch', roleName: 'Overwatch' },
  { key: 'g_ml', label: 'Mobile Legends', emoji: '📱', roleName: 'Mobile Legends' },
  { key: 'g_lol', label: 'League of Legends', emoji: '🏆', iconSlug: 'leagueoflegends', roleName: 'League of Legends' },
  { key: 'g_aram', label: 'ARAM (LOL)', emoji: '🎲', iconSlug: 'leagueoflegends', roleName: 'ARAM' },
];

const GAMES_B = [
  { key: 'g_tft', label: 'Teamfight Tactics', emoji: '♟️', iconSlug: 'teamfighttactics', roleName: 'Teamfight Tactics' },
  { key: 'g_genshin', label: 'Genshin Impact', emoji: '✨', roleName: 'Genshin Impact' },
  { key: 'g_wr', label: 'Wild Rift', emoji: '📲', iconSlug: 'riotgames', roleName: 'Wild Rift' },
  { key: 'g_marvel', label: 'Marvel Rivals', emoji: '🦹', roleName: 'Marvel Rivals' },
  { key: 'g_hsr', label: 'Honkai: Star Rail', emoji: '🚂', roleName: 'Honkai Star Rail' },
  { key: 'g_l4d', label: 'Left 4 Dead', emoji: '🧟', roleName: 'Left 4 Dead' },
  { key: 'g_hok', label: 'Honor of Kings', emoji: '👑', roleName: 'Honor of Kings' },
  { key: 'g_repo', label: 'R.E.P.O.', emoji: '📦', roleName: 'R.E.P.O.' },
  { key: 'g_elsword', label: 'Elsword', emoji: '⚡', roleName: 'Elsword' },
  { key: 'g_aov', label: 'Arena of Valor', emoji: '🛡️', roleName: 'Arena of Valor' },
];

const GAMES_C = [
  { key: 'g_stardew', label: 'Stardew Valley', emoji: '🌾', roleName: 'Stardew Valley' },
  { key: 'g_phasmo', label: 'Phasmophobia', emoji: '👻', roleName: 'Phasmophobia' },
  { key: 'g_fortnite', label: 'Fortnite', emoji: '🪂', iconSlug: 'fortnite', roleName: 'Fortnite' },
  { key: 'g_pubg', label: 'PUBG', emoji: '🪖', iconSlug: 'pubg', roleName: 'PUBG' },
  { key: 'g_pokemon', label: 'Pokémon UNITE', emoji: '🐾', iconSlug: 'pokemon', roleName: 'Pokemon UNITE' },
  { key: 'g_brawlhalla', label: 'Brawlhalla', emoji: '🥊', roleName: 'Brawlhalla' },
  { key: 'g_albion', label: 'Albion Online', emoji: '🏰', roleName: 'Albion' },
  { key: 'g_codm', label: 'Call of Duty Mobile', emoji: '🔫', iconSlug: 'activision', roleName: 'COD Mobile' },
  { key: 'g_heartopia', label: 'Heartopia', emoji: '💗', roleName: 'Heartopia' },
  { key: 'g_pc', label: 'PC Gamer', emoji: '🖥️', roleName: 'PC' },
  { key: 'g_console', label: 'Console', emoji: '🎮', roleName: 'Console' },
  { key: 'g_phone', label: 'Mobile / Phone', emoji: '📱', roleName: 'Phone' },
];

const MENU_SECTIONS = [
  { id: 'main', title: 'Community Role Menu', groups: ['intro'] },
  { id: 'identity', title: 'Identity & Preferences', groups: ['age', 'relationship'] },
  { id: 'games_a', title: 'Game Roles (1/3)', groups: ['games_a'] },
  { id: 'games_b', title: 'Game Roles (2/3)', groups: ['games_b'] },
  { id: 'games_c', title: 'Game Roles (3/3)', groups: ['games_c'] },
];

const GROUPS = {
  intro: { type: 'info', entries: [] },
  age: { type: 'single', entries: AGE },
  relationship: { type: 'single', entries: RELATIONSHIP },
  games_a: { type: 'multi', entries: GAMES_A },
  games_b: { type: 'multi', entries: GAMES_B },
  games_c: { type: 'multi', entries: GAMES_C },
};

module.exports = {
  AGE,
  RELATIONSHIP,
  GAMES_A,
  GAMES_B,
  GAMES_C,
  MENU_SECTIONS,
  GROUPS,
  allEntries() {
    return [...AGE, ...RELATIONSHIP, ...GAMES_A, ...GAMES_B, ...GAMES_C];
  },
  allGameEntries() {
    return [...GAMES_A, ...GAMES_B, ...GAMES_C];
  },
};
