import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';

const require = createRequire(import.meta.url);
const CHANNEL_ID = process.argv[2] || '1472598474431267020';
const GUILD_ID = '1426746102903738431';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  const ch = guild.channels.cache.get(CHANNEL_ID);
  if (!ch) {
    console.log('Channel not found:', CHANNEL_ID);
    client.destroy();
    process.exit(1);
  }
  const types = Object.fromEntries(Object.entries(ChannelType).map(([k, v]) => [v, k]));
  console.log('Channel:', ch.name, CHANNEL_ID);
  console.log('Type:', types[ch.type] ?? ch.type);
  console.log('Parent category:', ch.parentId ?? 'none');
  if (ch.parent) {
    const catOw = ch.parent.permissionOverwrites.cache.get(guild.roles.everyone.id);
    console.log('Category @everyone ViewChannel:', catOw?.allow.has('ViewChannel'), catOw?.deny.has('ViewChannel'));
  }
  const everyoneOw = ch.permissionOverwrites.cache.get(guild.roles.everyone.id);
  console.log('Channel @everyone overwrite exists:', Boolean(everyoneOw));
  if (everyoneOw) {
    console.log('  allow ViewChannel:', everyoneOw.allow.has('ViewChannel'));
    console.log('  deny ViewChannel:', everyoneOw.deny.has('ViewChannel'));
  } else {
    console.log('  (inherits from category / server)');
  }
  for (const [id, ow] of ch.permissionOverwrites.cache) {
    const target = ow.type === 0 ? guild.roles.cache.get(id)?.name : guild.members.cache.get(id)?.user?.tag;
    if (ow.allow.has('ViewChannel') || ow.deny.has('ViewChannel')) {
      console.log(`Overwrite ${target || id}: allow=${ow.allow.has('ViewChannel')} deny=${ow.deny.has('ViewChannel')}`);
    }
  }
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
