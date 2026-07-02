import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const { refreshVerifyMessage, DEFAULT_GUILD } = require('../src/verify/verifySystem.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  await refreshVerifyMessage(client, process.env.VERIFY_GUILD_ID || DEFAULT_GUILD);
  console.log('Verify embed updated to formal English.');
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
