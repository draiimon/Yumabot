/**
 * Bot-command channel enforcer.
 *
 * Only restricts USER-sent prefix commands (!, ?, ,, ., >, $, m!, etc.)
 * to the designated channel. Bot/webhook outputs (Dyno, MEE6, etc.) are
 * left alone — they can post anywhere.
 *
 * Our own bot's commands (j!*) are exempt everywhere.
 */

const { Events, PermissionFlagsBits } = require('discord.js');

/** Only allowed channel for bot commands. */
const ALLOWED_BOT_COMMAND_CHANNEL = '1426765614252298332';
const NOTICE_TTL_MS = 8_000;

/** Returns true if the message content looks like a prefix-style bot command
 *  from someone OTHER than us. */
function looksLikeForeignBotCommand(content) {
  const c = String(content || '').trimStart();
  if (!c) return false;
  // Our bot's prefix — always allowed everywhere
  if (/^j!/i.test(c)) return false;
  // Two-char letter-prefix patterns (m!play, t!skip, s!ban, etc.) — letter + ! followed by a command word
  if (/^[a-zA-Z][!.][a-zA-Z]/.test(c)) return true;
  // Single-char prefix followed by a command word (at least 2 letters)
  // Covers: !play, ?help, ,verify, .ban, >mute, $shop, ~kick, %warn, &foo
  if (/^[!?,.>$~%&+=*][a-zA-Z]{2,}/.test(c)) return true;
  return false;
}

async function sendNotice(channel, member) {
  try {
    const notice = await channel.send({
      content:
        `${member} — bot commands are only allowed in <#${ALLOWED_BOT_COMMAND_CHANNEL}>.\n` +
        `Please use that channel for any bot interactions.`,
      allowedMentions: { users: [member.id] },
    });
    setTimeout(() => {
      notice.delete().catch(() => {});
    }, NOTICE_TTL_MS);
  } catch {
    // notice couldn't post — silent fallback
  }
}

function registerCommandChannelEnforcer(client) {
  if (client._cmdChannelEnforcerRegistered) return;
  client._cmdChannelEnforcerRegistered = true;

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild) return;
      if (message.channel.id === ALLOWED_BOT_COMMAND_CHANNEL) return; // allowed here
      if (message.channel?.isThread?.()) return; // threads exempt

      const me = message.guild.members.me;
      if (!me) return;
      const canManage = message.channel
        .permissionsFor(me)
        ?.has(PermissionFlagsBits.ManageMessages);

      // Skip all bot/webhook messages — Dyno, MEE6, etc. can post anywhere.
      if (message.author?.bot) return;

      // CASE B: message from a user — only delete if it looks like a bot command
      if (!looksLikeForeignBotCommand(message.content)) return;
      if (!canManage) {
        console.warn(`[CMD-CHANNEL] Lacking ManageMessages in #${message.channel.name}`);
        return;
      }
      await message.delete().catch(() => {});
      console.log(
        `[CMD-CHANNEL] Deleted user cmd "${message.content.slice(0, 30)}" from ${message.author.tag} in #${message.channel.name}`,
      );
      const member = message.member ||
        (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (member) await sendNotice(message.channel, member);
    } catch (err) {
      console.error('[CMD-CHANNEL] handler error:', err.message);
    }
  });

  console.log(
    `[CMD-CHANNEL] Bot-command enforcer active — user prefix commands restricted to #${ALLOWED_BOT_COMMAND_CHANNEL} (bot/webhook outputs unrestricted)`,
  );
}

module.exports = {
  registerCommandChannelEnforcer,
  looksLikeForeignBotCommand,
  ALLOWED_BOT_COMMAND_CHANNEL,
};
