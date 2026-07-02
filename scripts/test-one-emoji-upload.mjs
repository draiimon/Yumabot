import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const { fetchIconBuffer } = require('../src/roleMenu/guildEmojiIcons.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  await client.application.fetch();
  await client.application.emojis.fetch();
  console.log('App emojis:', client.application.emojis.cache.size);

  const buf = await fetchIconBuffer({ key: 'g_valorant', label: 'Valorant', emoji: '🎯' });
  console.log('Buffer', buf.length, '— creating APPLICATION emoji…');

  const emoji = await Promise.race([
    client.application.emojis.create({ attachment: buf, name: 'rm_test_val' }),
    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 30000)),
  ]);
  console.log('OK', emoji.name, emoji.id, emoji.toString());
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
