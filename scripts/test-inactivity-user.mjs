/**
 * Force a member to look inactive and trigger inactivity DMs (admin test).
 * Usage:
 *   node scripts/test-inactivity-user.mjs [userId] warn   — warning DM only
 *   node scripts/test-inactivity-user.mjs [userId] revoke — remove Verified + re-verify DM (default)
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  DEFAULT_GUILD,
  getGuildVerifyConfig,
  patchActivityRow,
  revokeForInactivity,
  buildInactivityWarningDm,
} = require('../src/inactivity/inactivitySystem.js');

const USER_ID = process.argv[2] || '1028282588470714459';
const MODE = (process.argv[3] || 'revoke').toLowerCase();
const GUILD_ID = process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD;
const INACTIVE_MS = 6 * 24 * 60 * 60 * 1000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();
    const verifyCfg = getGuildVerifyConfig(GUILD_ID);
    if (!verifyCfg?.roleId) throw new Error('No verify config');

    const member = await guild.members.fetch(USER_ID);
    const fakeLastActive = new Date(Date.now() - INACTIVE_MS).toISOString();

    patchActivityRow(GUILD_ID, USER_ID, {
      lastActiveAt: fakeLastActive,
      warnedAt: null,
      testForcedAt: new Date().toISOString(),
    });

    console.log(`User: ${member.user.tag} (${USER_ID})`);
    console.log(`Forced lastActiveAt → ${fakeLastActive} (6 days ago)`);
    console.log(`Verified now: ${member.roles.cache.has(verifyCfg.roleId)}`);

    if (!member.roles.cache.has(verifyCfg.roleId)) {
      const role = guild.roles.cache.get(verifyCfg.roleId);
      await member.roles.add(role, 'JanJan inactivity test — grant Verified to demo revoke');
      member = await guild.members.fetch(USER_ID, { force: true });
      console.log('Granted Verified for test.');
    }

    if (MODE === 'warn') {
      const text = buildInactivityWarningDm(member, verifyCfg, 12);
      await member.user.send(text);
      patchActivityRow(GUILD_ID, USER_ID, { warnedAt: new Date().toISOString() });
      console.log('\n✅ Warning DM sent. Verified role kept.');
    } else {
      const result = await revokeForInactivity(member, verifyCfg);
      console.log('\n✅ Revoke result:', result);
      console.log('DM = re-verification required message.');
      console.log('User can react ✅ on verify again (intro + roles stay saved).');
    }
  } catch (err) {
    console.error('\n❌', err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
    process.exit(process.exitCode || 0);
  }
});

client.login(process.env.DISCORD_TOKEN);
