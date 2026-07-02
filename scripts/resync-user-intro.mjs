/** Resync one user's intro from #introduction channel. */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const { checkVerifyReadiness, resolveIntroForVerify } = require('../src/intro/introSystem.js');
const { DEFAULT_GUILD } = require('../src/roleMenu/roleMenuSystem.js');

const USER_ID = process.argv[2] || '1028282588470714459';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  const guild = await client.guilds.fetch(DEFAULT_GUILD);
  const member = await guild.members.fetch(USER_ID);
  const { intro, introComplete } = await resolveIntroForVerify(member, guild.id, { client });
  const readiness = await checkVerifyReadiness(member, guild.id, { client });
  console.log('Intro complete:', introComplete, intro?.fields);
  console.log('Ready to verify:', readiness.ok);
  if (!readiness.ok) console.log('Blockers:', readiness.blockers.map((b) => b.title));
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
