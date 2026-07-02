/**
 * One-off: ensure the Unverified category + reminder channel exist, then
 * clean the channel (delete any leftover reminders) and send ONE fresh
 * reminder that auto-verifies any ready members.
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  sendVerificationReminder,
  setGuildConfig,
  UNVERIFIED_ROLE_ID,
} = require('../src/verify/verifyReminder.js');

const GUILD_ID = '1426746102903738431';
const CATEGORY_NAME = '🔒︱ᴜɴᴠᴇʀɪғɪᴇᴅ';
const CHANNEL_NAME = '⚠️︱ᴠᴇʀɪғʏ-ʀᴇᴍɪɴᴅᴇʀ';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
await client.login(process.env.DISCORD_TOKEN);
await new Promise((r) => client.once('clientReady', r));

const guild = await client.guilds.fetch(GUILD_ID);
const me = await guild.members.fetchMe();

let category = guild.channels.cache.find(
  (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
);
if (!category) {
  category = await guild.channels.create({
    name: CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: UNVERIFIED_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageWebhooks,
        ],
      },
    ],
    reason: 'Verify reminder system setup',
  });
  console.log(`✓ Created category ${category.id}`);
} else {
  console.log(`✓ Category exists ${category.id}`);
}

let channel = guild.channels.cache.find(
  (c) => c.parentId === category.id && c.name === CHANNEL_NAME,
);
if (!channel) {
  channel = await guild.channels.create({
    name: CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: 'Daily verification reminder at 10:00 PM (Asia/Manila). Complete intro + roles to unlock the server.',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: UNVERIFIED_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
        ],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageWebhooks,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
    ],
    reason: 'Verify reminder channel',
  });
  console.log(`✓ Created channel ${channel.id}`);
} else {
  console.log(`✓ Channel exists ${channel.id}`);
}

// Clean any leftover messages from the channel so we start fresh
console.log('Cleaning channel...');
const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
if (msgs) {
  for (const m of msgs.values()) {
    if (m.deletable) await m.delete().catch(() => {});
  }
  console.log(`  cleaned ${msgs.size} message(s)`);
}

setGuildConfig(GUILD_ID, {
  channelId: channel.id,
  categoryId: category.id,
  messageId: null,
  lastFireKey: null,
});

console.log('\nSending fresh reminder (and auto-verifying ready members)...');
const result = await sendVerificationReminder(client, GUILD_ID);
console.log(JSON.stringify(result, null, 2));

console.log(`\nDone. Channel: <#${channel.id}>`);
client.destroy();
process.exit(0);
