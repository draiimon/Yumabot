/**
 * One-off: deny ViewChannel + SendMessages for every foreign bot in every
 * channel EXCEPT the designated bot-commands channel.
 *
 * Foreign bot = any bot user other than our own (JanJan). This is the
 * permission-level enforcement that the regex-based message deleter
 * cannot guarantee (since both bots receive messages in parallel).
 *
 * After running: foreign bots literally cannot see/respond to commands
 * outside #bot-commands. Music never starts because Jockie etc. never
 * processes the command.
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

const GUILD_ID = '1426746102903738431';
const ALLOWED_CHANNEL_ID = '1426765614252298332';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
await client.login(process.env.DISCORD_TOKEN);
await new Promise((r) => client.once('clientReady', r));

const guild = await client.guilds.fetch(GUILD_ID);
const me = await guild.members.fetchMe();
await guild.members.fetch();

// Identify foreign bots (any bot that isn't JanJan)
const foreignBots = [];
for (const member of guild.members.cache.values()) {
  if (!member.user.bot) continue;
  if (member.id === client.user.id) continue;
  foreignBots.push(member);
}
console.log(`Found ${foreignBots.length} foreign bot(s):`);
for (const b of foreignBots) console.log(`  - ${b.user.tag} (${b.id})`);

// Iterate every channel that isn't the allowed one
let muted = 0;
let unmuted = 0;
let failed = 0;

const textLike = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildCategory,
]);

for (const channel of guild.channels.cache.values()) {
  if (!textLike.has(channel.type)) continue;
  if (channel.id === ALLOWED_CHANNEL_ID) {
    // Make sure foreign bots CAN view/send here (clear any leftover deny)
    for (const bot of foreignBots) {
      try {
        const existing = channel.permissionOverwrites.cache.get(bot.id);
        if (existing) {
          await channel.permissionOverwrites.delete(bot.id, 'Allow bot in command channel');
          unmuted += 1;
        }
      } catch (err) {
        console.warn(`  ✗ unmute ${bot.user.tag} in #${channel.name}: ${err.message}`);
        failed += 1;
      }
    }
    continue;
  }

  // Mute foreign bots in this channel
  for (const bot of foreignBots) {
    try {
      await channel.permissionOverwrites.edit(
        bot.id,
        {
          ViewChannel: false,
          SendMessages: false,
        },
        { reason: 'Lock foreign bots to #bot-commands' },
      );
      muted += 1;
      if (muted % 20 === 0) console.log(`  ${muted} channel-bot pairs muted so far...`);
    } catch (err) {
      console.warn(`  ✗ mute ${bot.user.tag} in #${channel.name}: ${err.message}`);
      failed += 1;
    }
  }
}

console.log(`\nDone. Muted ${muted}, unmuted ${unmuted}, failed ${failed}.`);
console.log(
  `Foreign bots now invisible in every channel except <#${ALLOWED_CHANNEL_ID}>. They cannot process commands posted elsewhere.`,
);

client.destroy();
process.exit(0);
