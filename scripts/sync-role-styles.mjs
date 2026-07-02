/** Rename roles to searchable plain names + colors (fast, no embed refresh). */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const { allEntries } = require('../src/roleMenu/definitions.js');
const {
  syncAllRoleAppearances,
  DEFAULT_GUILD,
} = require('../src/roleMenu/roleMenuSystem.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD);
  await guild.roles.fetch();
  await syncAllRoleAppearances(guild);
  console.log('Role names synced (plain ASCII for @ search) + colors.');
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
