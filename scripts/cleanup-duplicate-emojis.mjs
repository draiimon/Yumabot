/**
 * Remove duplicate/orphan rm_* bot app emojis (keeps exactly 32 game icons).
 * Does NOT re-upload unless icons are missing after cleanup.
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Events } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  dedupeRoleMenuAppEmojis,
  ensureGuildEmojisForEntries,
  applyIconMapToMappings,
  emojiNameForEntry,
} = require('../src/roleMenu/guildEmojiIcons.js');
const { allEntries, allGameEntries } = require('../src/roleMenu/definitions.js');
const {
  repairRoleMenu,
  registerRoleMenuHandlers,
  getGuildRoleMenuConfig,
  loadRoleMenuConfig,
  saveRoleMenuConfig,
  DEFAULT_GUILD,
} = require('../src/roleMenu/roleMenuSystem.js');

process.env.SKIP_EMOJI_GG_WARMUP = '1';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
});

client.once(Events.ClientReady, async () => {
  registerRoleMenuHandlers(client);
  const guildId = process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD;

  try {
    const cfg = getGuildRoleMenuConfig(guildId);
    const preferIds = Object.fromEntries(
      Object.entries(cfg?.mappings || {})
        .filter(([k]) => k.startsWith('g_'))
        .map(([k, m]) => [k, m?.emojiId])
        .filter(([, id]) => id),
    );

    console.log('=== CLEANUP DUPLICATE EMOJIS ===\n');
    const { removed, count, expected } = await dedupeRoleMenuAppEmojis(client, { preferIds });
    console.log(`Removed ${removed} duplicate/orphan emoji(s).\n`);

    const guild = await client.guilds.fetch(guildId);
    const missing = allGameEntries().filter(
      (e) => !client.application.emojis.cache.find((em) => em.name === emojiNameForEntry(e)),
    );
    if (missing.length) {
      console.log(`Uploading ${missing.length} missing icon(s)…\n`);
      const iconMap = await ensureGuildEmojisForEntries(guild, allEntries(), {
        upload: true,
        replace: false,
        preferIds,
      });
      let mappings = applyIconMapToMappings(cfg.mappings, iconMap);
      const disk = loadRoleMenuConfig();
      disk[String(guildId)] = { ...cfg, mappings };
      saveRoleMenuConfig(disk);
    }

    await client.application.emojis.fetch();
    const rm = [...client.application.emojis.cache.values()].filter((e) =>
      e.name?.startsWith('rm_'),
    );
    console.log(`App emojis: ${rm.length} (expect ${expected})\n`);

    if (process.argv.includes('--repair')) {
      console.log('Repairing reactions…\n');
      await repairRoleMenu(client, guildId);
    }

    console.log('✅ Cleanup done.');
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
