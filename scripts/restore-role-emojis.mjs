/**
 * Restore role-menu icons: remove bad duplicate batch, re-link originals,
 * then repair embeds + reactions (no mass delete of all rm_ emojis).
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  repairRoleMenu,
  registerRoleMenuHandlers,
  getGuildRoleMenuConfig,
  loadRoleMenuConfig,
  saveRoleMenuConfig,
  ensureRoles,
  DEFAULT_GUILD,
} = require('../src/roleMenu/roleMenuSystem.js');
const {
  dedupeRoleMenuAppEmojis,
  ensureGuildEmojisForEntries,
  applyIconMapToMappings,
} = require('../src/roleMenu/guildEmojiIcons.js');
const { allEntries } = require('../src/roleMenu/definitions.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.once(Events.ClientReady, async () => {
  registerRoleMenuHandlers(client);
  try {
    const guildId = process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD;
    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();

    await client.application.fetch();
    const cfg0 = getGuildRoleMenuConfig(guildId);
    const preferIds = Object.fromEntries(
      Object.entries(cfg0?.mappings || {})
        .filter(([k]) => k.startsWith('g_'))
        .map(([k, m]) => [k, m?.emojiId])
        .filter(([, id]) => id),
    );
    const { removed } = await dedupeRoleMenuAppEmojis(client, { preferIds });
    console.log(`[RESTORE] Removed ${removed} duplicate/orphan app emoji(s).`);

    console.log('[RESTORE] Linking icons (no mass delete)…');
    const iconMap = await ensureGuildEmojisForEntries(guild, allEntries(), {
      upload: true,
      replace: false,
    });

    const cfg = getGuildRoleMenuConfig(guildId);
    let mappings = await ensureRoles(guild, false);
    mappings = applyIconMapToMappings(mappings, iconMap);

    const config = loadRoleMenuConfig();
    config[String(guildId)] = { ...cfg, mappings, iconMapKeys: Object.keys(iconMap) };
    saveRoleMenuConfig(config);

    console.log('[RESTORE] Repairing embeds + reactions…');
    await repairRoleMenu(client, guildId);

    console.log('\n✅ Restore done.');
    console.log('  Game icons:', Object.keys(iconMap).filter((k) => k.startsWith('g_')).length);
    console.log('  Mappings:', Object.keys(mappings).length);
  } catch (err) {
    console.error('\n❌ Restore failed:', err);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
