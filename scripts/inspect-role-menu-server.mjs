import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const GUILD_ID = '1426746102903738431';
const TARGET = process.argv[2] || '1426856978608816253';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.emojis.fetch();
  await guild.channels.fetch();

  const ch = guild.channels.cache.get(TARGET);
  if (ch?.isTextBased()) {
    console.log('Channel:', ch.name, ch.id);
    const msgs = await ch.messages.fetch({ limit: 5 });
    for (const m of msgs.values()) {
      console.log('  msg', m.id, m.author.tag, m.embeds.length, 'embeds');
    }
  } else {
    try {
      const msg = await (await guild.channels.fetch()).find?.();
    } catch {}
    for (const c of guild.channels.cache.values()) {
      if (!c.isTextBased()) continue;
      try {
        const m = await c.messages.fetch(TARGET).catch(() => null);
        if (m) {
          console.log('Message in', c.name, c.id);
          console.log('Author:', m.author.tag);
          console.log('Content len:', m.content?.length);
          console.log('Embeds:', m.embeds.length);
          console.log('Reactions:', [...m.reactions.cache.keys()]);
        }
      } catch {}
    }
  }

  console.log('\n--- Roles (sample) ---');
  const roles = [...guild.roles.cache.values()]
    .filter((r) => !r.managed && r.name !== '@everyone')
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const r of roles.slice(0, 80)) {
    console.log(r.id, JSON.stringify(r.name), r.unicodeEmoji || '');
  }
  console.log('Total roles:', roles.length);

  console.log('\n--- Custom emojis (Pride/game) ---');
  for (const e of guild.emojis.cache.values()) {
    if (/pride|valorant|roblox|minecraft|dota|lol|genshin|wuthering|honkai|fortnite|pubg|mobile|overwatch|dead|marvel|wild|tft|aram|phasmo|stardew|elsword|aov|repo|hok|brawl|albion|codm|heartopia|bumper|single|relationship|complicated|17|18|24|25|30/i.test(e.name)) {
      console.log(e.animated ? 'a' : '', e.name, e.id);
    }
  }
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
