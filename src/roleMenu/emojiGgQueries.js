/**
 * Search terms per role — first match on emoji.gg wins (square Discord-style icons).
 */
const EMOJI_GG_QUERIES = {
  age_17: ['age17', '17'],
  age_18_24: ['18', 'youngadult'],
  age_25_30: ['25', 'adult'],
  age_30p: ['30', 'oldman', 'elder'],
  rel_single: ['single', 'singlelife'],
  rel_taken: ['couple', 'relationship', 'taken'],
  rel_complicated: ['complicated', 'heartbreak', 'brokenheart'],
  bumper: ['bell', 'notification', 'bumper'],
  g_valorant: ['valorant', 'valo', 'riotvalorant'],
  g_roblox: ['roblox'],
  g_minecraft: ['minecraft'],
  g_wuwa: ['wutheringwaves', 'wuwa'],
  g_dota2: ['dota2', 'dota'],
  g_dbdl: ['deadbydaylight', 'dbd'],
  g_ow: ['overwatch'],
  g_ml: ['mobilelegends', 'mlbb'],
  g_lol: ['leagueoflegends', 'lolicon', 'lol_logo', 'leagueoflegendslogo'],
  g_aram: ['aram', 'leagueoflegends'],
  g_tft: ['tft', 'teamfighttactics'],
  g_genshin: ['genshinimpact', 'genshin'],
  g_wr: ['wildrift', 'lolwildrift'],
  g_marvel: ['marvelrivals', 'marvel'],
  g_hsr: ['honkaistarrail', 'starrail', 'hsr'],
  g_l4d: ['left4dead', 'l4d'],
  g_hok: ['honorofkings', 'hok'],
  g_repo: ['repo'],
  g_elsword: ['elsword'],
  g_aov: ['arenaofvalor', 'aov'],
  g_stardew: ['stardewvalley', 'stardew'],
  g_phasmo: ['phasmophobia', 'phasmo'],
  g_fortnite: ['fortnite'],
  g_pubg: ['pubg'],
  g_pokemon: ['pokemonunite', 'pokemon'],
  g_brawlhalla: ['brawlhalla'],
  g_albion: ['albiononline', 'albion'],
  g_codm: ['codmobile', 'callofduty', 'codm'],
  g_heartopia: ['heartopia'],
  g_pc: ['pcgaming', 'desktop', 'computer'],
  g_console: ['console', 'xbox', 'playstation'],
  g_phone: ['mobilegaming', 'phone', 'smartphone'],
};

/** Curated square icons from emoji.gg CDN (verified 1:1-style logos). */
const EMOJI_GG_DIRECT = {
  g_valorant: 'https://cdn3.emoji.gg/emojis/valorAnimated_4734.gif',
  g_roblox: 'https://cdn3.emoji.gg/emojis/1404_Roblox_JOYwithJOY.png',
  g_minecraft: 'https://cdn3.emoji.gg/emojis/9415_Minecraft_bread.png',
  g_dota2: 'https://cdn3.emoji.gg/emojis/PeridotApproves.png',
  g_ow: 'https://cdn3.emoji.gg/emojis/overwatch.png',
  g_lol: 'https://cdn3.emoji.gg/emojis/LeagueOfLosers.png',
  g_fortnite: 'https://cdn3.emoji.gg/emojis/fortnitellamahead.png',
  g_pubg: 'https://cdn3.emoji.gg/emojis/pubg.png',
  g_stardew: 'https://cdn3.emoji.gg/emojis/StardewValley.png',
  g_pokemon: 'https://cdn3.emoji.gg/emojis/MadPokemonTrainer.png',
};

const BLOCKLIST = /\b(loli|lewd|nsfw|porn|hentai|nude|sex|xxx)\b/i;

module.exports = { EMOJI_GG_QUERIES, EMOJI_GG_DIRECT, BLOCKLIST };
