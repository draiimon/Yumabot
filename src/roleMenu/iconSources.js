/**
 * Official-style game logo images (square PNG/JPG).
 * emoji.gg CDN = same assets listed on discords.com (e.g. /add type:emoji id:771411-valorant)
 * Steam = official store library logo art
 * Site favicons = official domain icons (genshin.hoyoverse.com, m.mobilelegends.com)
 * Riot CDN = ddragon summoner icons (ARAM poro, distinct from LoL logo)
 */

const EMOJI_GG = 'https://cdn3.emoji.gg/emojis';
const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon';

/** High-res favicon from the game's official website (Google s2 cache). */
const siteFavicon = (domain) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const steamLogo = (appId) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/logo.png`;

/** Official Riot Games CMS (TFT header logo from teamfighttactics.leagueoflegends.com). */
const RIOT_CMS_TFT_LOGO =
  'https://cmsassets.rgpub.io/sanity/images/dsfx7636/riotbar/2ae078fdfa096ab69b3b30499d4d07786080f690-2084x2084.png?h=512&fit=max';

/** Official app/site logos (downscaled on upload). */
const OFFICIAL_APP_LOGOS = {
  g_pokemon: 'https://unite.pokemon.com/images/common/en-us/unite-logo-2x.png',
  g_hok: siteFavicon('honorofkings.com'),
  g_hsr: siteFavicon('hsr.hoyoverse.com'),
  g_aov: siteFavicon('arenaofvalor.com'),
  g_roblox: siteFavicon('roblox.com'),
  /** Mojang app icon — grass block, not text title. */
  g_minecraft:
    'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c9/81/16/c981164e-410c-7a07-d76b-3a8e4238793b/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/512x512bb.jpg',
  g_heartopia:
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/0c/15/ea/0c15ea0f-8466-d8b8-d710-3c7d36338949/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/512x512bb.jpg',
  g_wuwa:
    'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b5/44/ca/b544ca0a-dd46-a268-b2fa-533d41f97ff7/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg',
};

/** Curated emoji.gg game logos — real logo PNGs from emoji.gg/emoji pages */
const EMOJI_GG_LOGOS = {
  g_valorant: `${EMOJI_GG}/771411-valorant.png`,
  g_lol: `${EMOJI_GG}/149722-lol.png`,
  g_fortnite: `${EMOJI_GG}/FortniteLogo.png`,
  g_pubg: `${EMOJI_GG}/pubg.png`,
  g_ow: `${EMOJI_GG}/overwatch.png`,
  g_stardew: `${EMOJI_GG}/StardewValley.png`,
  g_marvel: `${EMOJI_GG}/Marvel.png`,
  g_dbdl: `${EMOJI_GG}/bd.png`,
};

/** Riot games — each mode uses a different official asset (not the same LoL PNG). */
const RIOT_GAME_LOGOS = {
  g_aram: `${DDRAGON}/4895.png`,
  g_tft: RIOT_CMS_TFT_LOGO,
  g_wr: siteFavicon('wildrift.leagueoflegends.com'),
};

/** Official website favicons (HoYoverse, Moonton mobile site). */
const SITE_FAVICON_LOGOS = {
  g_genshin: siteFavicon('genshin.hoyoverse.com'),
  g_ml: siteFavicon('m.mobilelegends.com'),
};

/** Steam official logo.png (square game icon art) */
const STEAM_GAME_LOGOS = {
  g_l4d: steamLogo(500),
  g_phasmo: steamLogo(739630),
  g_brawlhalla: steamLogo(291550),
  g_albion: steamLogo(761890),
  g_repo: steamLogo(3241660),
  g_dota2: steamLogo(570),
  g_codm: steamLogo(1938090),
  g_elsword: steamLogo(237310),
};

const PLATFORM_LOGOS = {
  g_pc: `${EMOJI_GG}/754310-neon-steam-icon.png`,
  g_console: `${EMOJI_GG}/XboxLogoSymbol.png`,
  g_phone: `${EMOJI_GG}/PhoneThonk.png`,
};

function resolveGameIconUrl(entryKey) {
  if (OFFICIAL_APP_LOGOS[entryKey]) {
    return { url: OFFICIAL_APP_LOGOS[entryKey], source: 'official-app' };
  }
  if (EMOJI_GG_LOGOS[entryKey]) {
    return { url: EMOJI_GG_LOGOS[entryKey], source: 'emoji.gg-logo' };
  }
  if (RIOT_GAME_LOGOS[entryKey]) {
    return { url: RIOT_GAME_LOGOS[entryKey], source: 'riot-official' };
  }
  if (SITE_FAVICON_LOGOS[entryKey]) {
    return { url: SITE_FAVICON_LOGOS[entryKey], source: 'site-favicon' };
  }
  if (STEAM_GAME_LOGOS[entryKey]) {
    return { url: STEAM_GAME_LOGOS[entryKey], source: 'steam-logo' };
  }
  if (PLATFORM_LOGOS[entryKey]) {
    return { url: PLATFORM_LOGOS[entryKey], source: 'platform' };
  }
  return null;
}

module.exports = {
  resolveGameIconUrl,
  OFFICIAL_APP_LOGOS,
  EMOJI_GG_LOGOS,
  RIOT_GAME_LOGOS,
  SITE_FAVICON_LOGOS,
  STEAM_GAME_LOGOS,
  PLATFORM_LOGOS,
};
