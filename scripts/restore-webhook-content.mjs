/**
 * One-off: restore PLAYGROUND webhook content that was auto-deleted
 * by the buggy commandChannelEnforcer (82b9b8c, since fixed in d7a59d3).
 *
 * Re-posts:
 *  - Intro guide embed in #📝︱ɪɴᴛʀᴏᴅᴜᴄᴛɪᴏɴ
 *  - Verify reminder in #⚠️︱ᴠᴇʀɪғʏ-ʀᴇᴍɪɴᴅᴇʀ
 *  - Re-runs verify message setup if needed
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { setupIntroChannel } = require('../src/intro/introSystem.js');
const { sendVerificationReminder } = require('../src/verify/verifyReminder.js');
const { refreshVerifyMessage } = require('../src/verify/verifySystem.js');

const GUILD_ID = '1426746102903738431';
const INTRO_CHANNEL_ID = '1506284754818044019';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});
await client.login(process.env.DISCORD_TOKEN);
await new Promise((r) => client.once('clientReady', r));

const guild = await client.guilds.fetch(GUILD_ID);

// 1. Intro guide — setupIntroChannel(client, guildId, opts)
try {
  console.log('Repopulating intro guide via setupIntroChannel...');
  const result = await setupIntroChannel(client, GUILD_ID, { createIfMissing: true });
  console.log(`  ✓ Intro guide posted`);
} catch (err) {
  console.warn('  ✗ Intro guide failed:', err.message);
}

// 2. Verify reminder
try {
  console.log('Sending verify reminder...');
  const result = await sendVerificationReminder(client, GUILD_ID);
  console.log(`  ✓ Verify reminder: auto-verified ${result.autoVerifiedCount}, pending ${result.pendingCount}`);
} catch (err) {
  console.warn('  ✗ Verify reminder failed:', err.message);
}

// 3. Refresh verify message (only if it's broken)
try {
  console.log('Refreshing verify message...');
  await refreshVerifyMessage(client, GUILD_ID);
  console.log(`  ✓ Verify message refreshed`);
} catch (err) {
  console.warn('  ✗ Verify message refresh skipped/failed:', err.message);
}

console.log('\nDone.');
client.destroy();
process.exit(0);
