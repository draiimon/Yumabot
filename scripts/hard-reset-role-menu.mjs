/**
 * HARD RESET: delete ALL rm_* app emojis, re-upload official icons once,
 * fix role IDs, refresh 5 compact messages (intro · age/rel · games 1-3).
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
  sanitizeMappingsMap,
  DEFAULT_GUILD,
} = require('../src/roleMenu/roleMenuSystem.js');
const {
  deleteOldAppEmojis,
  ensureGuildEmojisForEntries,
  applyIconMapToMappings,
} = require('../src/roleMenu/guildEmojiIcons.js');
const { allEntries } = require('../src/roleMenu/definitions.js');

process.env.SKIP_EMOJI_GG_WARMUP = '1';
process.env.ROLE_MENU_UPLOAD_DELAY_MS = process.env.ROLE_MENU_UPLOAD_DELAY_MS || '2000';
process.env.ROLE_MENU_DELETE_DELAY_MS = process.env.ROLE_MENU_DELETE_DELAY_MS || '500';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction],
});

client.once(Events.ClientReady, async () => {
  registerRoleMenuHandlers(client);
  const guildId = process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD;

  try {
    console.log('=== HARD RESET ROLE MENU ===\n');

    const cfg = getGuildRoleMenuConfig(guildId);
    if (!cfg?.channelId) throw new Error('No role menu config');

    const sanitized = sanitizeMappingsMap(cfg.mappings || {}, { stripGameEmojis: true });
    const disk = loadRoleMenuConfig();
    disk[String(guildId)] = { ...cfg, mappings: sanitized };
    saveRoleMenuConfig(disk);
    console.log('Cleared broken emoji IDs from config.\n');

    await client.application.fetch();
    const deleted = await deleteOldAppEmojis(client);
    console.log(`\nDeleted ${deleted} rm_* application emoji(s).\n`);

    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();

    console.log('Uploading fresh official game icons (one per game)…\n');
    const iconMap = await ensureGuildEmojisForEntries(guild, allEntries(), {
      upload: true,
      replace: false,
    });

    let mappings = sanitized;
    for (const entry of allEntries()) {
      if (!entry.key.startsWith('g_')) continue;
      const role = guild.roles.cache.find(
        (r) =>
          r.name === entry.roleName ||
          r.name.toLowerCase().includes(entry.roleName.toLowerCase().slice(0, 6)),
      );
      if (role && mappings[entry.key]) mappings[entry.key].roleId = role.id;
    }
    mappings = applyIconMapToMappings(mappings, iconMap);
    disk[String(guildId)] = { ...disk[String(guildId)], mappings };
    saveRoleMenuConfig(disk);

    await client.application.emojis.fetch();
    const rmCount = [...client.application.emojis.cache.values()].filter((e) =>
      e.name.startsWith('rm_'),
    ).length;
    console.log(`\nBot app emojis now: ${rmCount} (expect 32 game icons)\n`);

    console.log('Repairing 5 messages + reactions…\n');
    const result = await repairRoleMenu(client, guildId);

    console.log('\n✅ HARD RESET DONE');
    console.log('Messages:', result.messageIds);
    console.log('Roles mapped:', Object.keys(result.mappings).length);
    const v = result.mappings.g_valorant;
    console.log('g_valorant roleId:', v?.roleId, '| emoji:', v?.emojiDisplay);
  } catch (err) {
    console.error('\n❌', err);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
