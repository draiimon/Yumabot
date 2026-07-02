/**
 * Slow emoji upload via BOT token (2.2s between uploads). Then refresh embeds.
 * Does NOT delete channel messages.
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const require = createRequire(import.meta.url);
const { refreshRoleMenuEmbeds, DEFAULT_GUILD } = require('../src/roleMenu/roleMenuSystem.js');

process.env.ROLE_MENU_UPLOAD_DELAY_MS = process.env.ROLE_MENU_UPLOAD_DELAY_MS || '2200';
process.env.ROLE_MENU_DELETE_DELAY_MS = process.env.ROLE_MENU_DELETE_DELAY_MS || '800';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.once('ready', async () => {
  console.log(`Bot: ${client.user.tag}`);
  console.log(`Upload delay: ${process.env.ROLE_MENU_UPLOAD_DELAY_MS}ms per game icon`);
  console.log('Mode: bot APPLICATION emojis from emoji.gg packs (not server emojis).\n');
  try {
    const result = await refreshRoleMenuEmbeds(client, process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD);
    console.log('\n✅ Done!', Object.keys(result.iconMap).length, 'icons mapped.');
  } catch (err) {
    console.error('\n❌ Failed:', err.message);
    process.exitCode = 1;
  }
  client.destroy();
  process.exit(process.exitCode || 0);
});

client.login(process.env.DISCORD_TOKEN);
