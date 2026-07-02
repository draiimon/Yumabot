/**
 * Bot-command channel enforcer.
 *
 * Restricts ALL bot prefix commands (other bots: !, ?, ,, ., >, $, m!, etc.)
 * to a single designated channel. Outside that channel, the user's command
 * message is deleted before the other bot can respond.
 *
 * Our own bot's commands (j!*) are exempt — those can be issued in any
 * channel because j!view etc. are useful contextually (e.g. checking
 * intro progress in #introduction).
 *
 * Other bots are not technically "muted" — they'll still respond if their
 * message reaches them first. But by deleting fast, we usually win the
 * race. The end-user experience is: the bot's response also gets orphaned
 * or never sent, and our notice tells them to use the designated channel.
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

      // CASE A: message from a FOREIGN BOT (any bot/webhook that isn't us)
      // Auto-delete in any channel except the allowed one.
      if (message.author?.bot) {
        if (message.author.id === client.user.id) return; // our bot user — exempt

        // Webhook message? Verify ownership before deciding.
        // Our own webhooks (intro guide, welcome, leave log, invite
        // counter, verify reminder, ticketing) MUST NOT be deleted —
        // they're our own outputs even though the author.id is the
        // webhook's, not the bot user's.
        if (message.webhookId) {
          try {
            const hook = await message.fetchWebhook();
            if (hook?.owner?.id === client.user.id) {
              return; // our own webhook — exempt
            }
          } catch {
            // Could not verify — name-based heuristic fallback
            const name = String(message.author?.username || '').toLowerCase();
            if (name.includes('yuma') || name.includes('playground') || name.includes('ᴘʟᴀʏ ɢʀᴏᴜɴᴅ')) {
              return;
            }
          }
        }

        if (!canManage) {
          console.warn(`[CMD-CHANNEL] Lacking ManageMessages in #${message.channel.name}`);
          return;
        }
        await message.delete().catch(() => {});
        console.log(
          `[CMD-CHANNEL] Deleted foreign bot msg from ${message.author.tag} in #${message.channel.name}`,
        );
        return;
      }

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
    `[CMD-CHANNEL] Bot-command enforcer active — only ${ALLOWED_BOT_COMMAND_CHANNEL} allows foreign-bot commands AND outputs`,
  );
}

module.exports = {
  registerCommandChannelEnforcer,
  looksLikeForeignBotCommand,
  ALLOWED_BOT_COMMAND_CHANNEL,
};
