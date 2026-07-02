import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const { repairVerifyPermissions, DEFAULT_GUILD } = require('../src/verify/verifySystem.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const cfg = await repairVerifyPermissions(
    client,
    process.env.VERIFY_GUILD_ID || DEFAULT_GUILD,
  );
  console.log('Fixed permissions.');
  console.log('Public (view):', cfg.publicChannelIds);
  console.log('Chat allowed:', cfg.chatChannelIds);
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
