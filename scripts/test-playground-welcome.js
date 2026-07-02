/**
 * Delete recent PLAYGROUND welcome posts and resend animated welcome.
 * Usage: node scripts/test-playground-welcome.js [userId] [--no-delete]
 */
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const { sendPlaygroundWelcome } = require('../src/welcome/playgroundWelcome');

const GUILD_ID = '1426746102903738431';
const WELCOME_CHANNEL = '1426746103616897129';
const DEFAULT_USER = '705770837399306332';

const args = process.argv.slice(2).filter((a) => a !== '--no-delete');
const userId = args[0] || DEFAULT_USER;
const skipDelete = process.argv.includes('--no-delete');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function deleteRecentWelcomePosts(channel) {
  const me = channel.guild.members.me || (await channel.guild.members.fetchMe());
  const canManage = channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages);
  if (!canManage) {
    console.warn('[welcome:test] No Manage Messages — skipping delete');
    return 0;
  }

  const messages = await channel.messages.fetch({ limit: 50 });
  let removed = 0;
  for (const msg of messages.values()) {
    const hasWelcomeFile = msg.attachments.some((a) => /welcome\.(mp4|gif|png)/i.test(a.name || ''));
    if (!hasWelcomeFile) continue;
    await msg.delete().catch(() => {});
    removed++;
  }
  return removed;
}

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(WELCOME_CHANNEL);

    if (!skipDelete) {
      const removed = await deleteRecentWelcomePosts(channel);
      console.log(`[welcome:test] deleted=${removed}`);
    }

    let member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      const user = await client.users.fetch(userId);
      member = { user, guild, id: user.id };
    }

    const ok = await sendPlaygroundWelcome(member);
    console.log(`[welcome:test] sent=${ok}`);
  } catch (err) {
    console.error('[welcome:test]', err);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
