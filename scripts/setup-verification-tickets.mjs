#!/usr/bin/env node
/**
 * One-shot: post/update the verification ticket panel in spawnpoint.
 * Usage:
 *   node scripts/setup-verification-tickets.mjs
 *   node scripts/setup-verification-tickets.mjs <channelId>
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  DEFAULT_GUILD,
  DEFAULT_SPAWNPOINT_CHANNEL,
  DEFAULT_STAFF_USER_ID,
  DEFAULT_STAFF_ROLE_ID,
  setupVerificationTicketPanel,
} = require('../src/tickets/verificationTicketSystem.js');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN missing in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  try {
    const result = await setupVerificationTicketPanel(
      client,
      process.env.TICKET_GUILD_ID || DEFAULT_GUILD,
      {
        channelId:
          process.argv[2] ||
          process.env.TICKET_PANEL_CHANNEL_ID ||
          DEFAULT_SPAWNPOINT_CHANNEL,
        staffUserId: process.env.TICKET_STAFF_USER_ID || DEFAULT_STAFF_USER_ID,
        staffRoleId: process.env.TICKET_STAFF_ROLE_ID || DEFAULT_STAFF_ROLE_ID,
      },
    );
    console.log('Ticket panel channel:', result.channel.name, result.channel.id);
    console.log('Panel message:', result.message.id);
    console.log('Staff notified:', result.staffUserId);
    console.log('Role notified:', result.staffRoleId);
    console.log('Done — restart/deploy bot so button + modal handlers are live.');
  } catch (err) {
    console.error('Ticket setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(token);
