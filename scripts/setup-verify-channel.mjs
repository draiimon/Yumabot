#!/usr/bin/env node
/**
 * One-shot: create verify channel, post bading embed, lock server behind Verified role.
 * Usage: node scripts/setup-verify-channel.mjs
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  setupVerifyChannel,
  DEFAULT_GUILD,
  DEFAULT_VERIFIED_ROLE,
} = require('../src/verify/verifySystem.js');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN missing in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once('ready', async () => {
  try {
    const result = await setupVerifyChannel(client, {
      guildId: process.env.VERIFY_GUILD_ID || DEFAULT_GUILD,
      verifiedRoleId: process.env.VERIFY_ROLE_ID || DEFAULT_VERIFIED_ROLE,
      lockServer: true,
    });
    console.log('Verify channel:', result.channel.name, result.channel.id);
    console.log('Message:', result.message.id);
    console.log('Verified role:', result.verifiedRoleId);
    console.log('Locked channels:', result.lockedChannels);
    console.log('Done — restart bot on Render so reaction handler is live.');
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exitCode = 1;
  }
  client.destroy();
  process.exit(process.exitCode || 0);
});

client.login(token);
