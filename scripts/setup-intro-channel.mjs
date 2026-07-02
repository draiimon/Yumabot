/**
 * Post introduction guide in #introduction channel.
 * Usage: node scripts/setup-intro-channel.mjs
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Events } from 'discord.js';

const require = createRequire(import.meta.url);
const { setupIntroChannel, DEFAULT_GUILD } = require('../src/intro/introSystem.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once(Events.ClientReady, async () => {
  try {
    const { repairVerifyPermissions } = require('../src/verify/verifySystem.js');
    const { channel, message } = await setupIntroChannel(
      client,
      process.env.INTRO_GUILD_ID || DEFAULT_GUILD,
    );
    console.log('Intro channel:', channel.id, `#${channel.name}`);
    console.log('Guide message:', message.id);
    await repairVerifyPermissions(client, process.env.INTRO_GUILD_ID || DEFAULT_GUILD);
    console.log('Verify permissions refreshed (intro visible + chat enabled).');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
