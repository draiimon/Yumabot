import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const GUILD_ID = '1426746102903738431';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  for (const r of guild.roles.cache.sort((a, b) => b.position - a.position).values()) {
    if (r.name.toLowerCase().includes('verif') || r.name.includes('ᴜɴ')) {
      console.log(r.id, r.name, 'members?', r.members?.size);
    }
  }
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
