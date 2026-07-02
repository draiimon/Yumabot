/**
 * Fix role-menu: roles, fonts, reactions, buttons.
 * Usage: node scripts/fix-role-menu.mjs
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  repairRoleMenu,
  registerRoleMenuHandlers,
  DEFAULT_GUILD,
} = require('../src/roleMenu/roleMenuSystem.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel],
});

async function main() {
  registerRoleMenuHandlers(client);
  const result = await repairRoleMenu(client, process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD);
  console.log('\nDone. Sample roles:');
  for (const k of ['g_valorant', 'age_17', 'g_phone']) {
    console.log(' ', k, '→', result.mappings[k]?.roleId);
  }
  console.log('Messages:', result.messageIds);
  console.log('\n⚠️  Restart JanJan bot (node index.js) so button/reaction handlers load in production.');
}

client.once(Events.ClientReady, () => {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => {
      client.destroy();
      process.exit(process.exitCode || 0);
    });
});

client.login(process.env.DISCORD_TOKEN);
