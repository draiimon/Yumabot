import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const require = createRequire(import.meta.url);
const { setupRoleMenu, DEFAULT_GUILD } = require('../src/roleMenu/roleMenuSystem.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

const webhookArg = (() => {
  const idx = process.argv.indexOf('--webhook');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.ROLE_MENU_WEBHOOK_NAME || null;
})();

client.once('ready', async () => {
  if (webhookArg) console.log(`Using webhook: "${webhookArg}"`);
  const result = await setupRoleMenu(client, {
    guildId: process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD,
    editMessageId: null,
    createRoles: !process.argv.includes('--no-create-roles'),
    webhookName: webhookArg,
  });
  console.log('Role menu posted/updated.');
  console.log('Messages:', result.messages.map((m) => m.id).join(', '));
  console.log('Mapped roles:', Object.keys(result.mappings).length);
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
