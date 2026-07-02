/**
 * One-off: run buildMemberViewEmbed for a specific user and post to a
 * specific channel. Equivalent to the user typing `j!view @<user>` there.
 */
import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client, GatewayIntentBits } = require('discord.js');
const { buildMemberViewEmbed } = require('../src/intro/introSystem.js');

const GUILD_ID = '1426746102903738431';
const TARGET_CHANNEL_ID = '1426746103797256200';
const TARGET_USERNAME = 'rawr.rawr.'; // user to look up

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
await client.login(process.env.DISCORD_TOKEN);
await new Promise((r) => client.once('clientReady', r));

const guild = await client.guilds.fetch(GUILD_ID);
await guild.members.fetch();

// Find the user by username (Discord new-format username) or globalName or displayName
let target = null;
for (const m of guild.members.cache.values()) {
  const u = m.user.username?.toLowerCase();
  const g = m.user.globalName?.toLowerCase();
  const d = m.displayName?.toLowerCase();
  const needle = TARGET_USERNAME.toLowerCase();
  if (u === needle || g === needle || d === needle) {
    target = m;
    break;
  }
}

if (!target) {
  // Try partial match
  for (const m of guild.members.cache.values()) {
    const u = m.user.username?.toLowerCase() || '';
    if (u.includes(TARGET_USERNAME.toLowerCase().replace('.', ''))) {
      target = m;
      break;
    }
  }
}

if (!target) {
  console.error(`User "${TARGET_USERNAME}" not found in guild`);
  client.destroy();
  process.exit(1);
}

console.log(`Found target: ${target.user.tag} (id: ${target.id}, display: ${target.displayName})`);

const channel = await guild.channels.fetch(TARGET_CHANNEL_ID);
console.log(`Target channel: #${channel.name}`);

console.log('Building embed...');
const embed = await buildMemberViewEmbed({
  member: target,
  targetUser: target.user,
  guild,
  client,
});

console.log('Sending...');
const sent = await channel.send({ embeds: [embed] });
console.log(`✓ Posted: message ID ${sent.id}`);

client.destroy();
process.exit(0);
