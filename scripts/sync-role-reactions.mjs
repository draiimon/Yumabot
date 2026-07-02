/**
 * Full reset of game-role reactions on all 3 Games messages (no embed edit).
 * Usage: node scripts/sync-role-reactions.mjs
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Events } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  getGuildRoleMenuConfig,
  loadRoleMenuConfig,
  saveRoleMenuConfig,
  iconMapFromStoredMappings,
  replaceReactionsOnMessage,
  DEFAULT_GUILD,
  GAME_MSG_START_IDX,
} = require('../src/roleMenu/roleMenuSystem.js');
const { applyIconMapToMappings } = require('../src/roleMenu/guildEmojiIcons.js');
const { GAME_PARTS } = require('../src/roleMenu/roleMenuEmbed.js');
const { GROUPS } = require('../src/roleMenu/definitions.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
});

client.once(Events.ClientReady, async () => {
  try {
    const guildId = process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD;
    const cfg = getGuildRoleMenuConfig(guildId);
    if (!cfg?.channelId || !cfg.messageIds?.length) throw new Error('No role menu config');

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(cfg.channelId);
    let mappings = cfg.mappings || {};
    const iconMap = iconMapFromStoredMappings(mappings);
    mappings = applyIconMapToMappings(mappings, iconMap);

    await client.application.fetch();
    await client.application.emojis.fetch();

    console.log('Syncing reactions on Games 1/3, 2/3, 3/3…\n');
    for (let i = 0; i < GAME_PARTS.length; i += 1) {
      const idx = GAME_MSG_START_IDX + i;
      const msgId = cfg.messageIds[idx];
      const msg = await channel.messages.fetch(msgId, { force: true });
      const title = msg.embeds[0]?.title || msgId;
      console.log(`--- ${title} ---`);
      await replaceReactionsOnMessage(msg, GROUPS[GAME_PARTS[i].group].entries, iconMap, client, {
        delayMs: 750,
      });
    }

    const config = loadRoleMenuConfig();
    config[String(guildId)] = { ...cfg, mappings };
    saveRoleMenuConfig(config);
    console.log('\n✅ All game reactions synced.');
  } catch (err) {
    console.error('\n❌', err);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
