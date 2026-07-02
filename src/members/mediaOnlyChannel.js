/**
 * Media-only channel enforcer.
 *
 * For every configured channel: any new top-level message that does NOT
 * include an image/video/audio attachment (or attachment-bearing embed link)
 * is auto-deleted. The bot then drops a 10-second self-deleting notice
 * pointing the user at threads for discussion.
 *
 * Messages inside THREADS of the channel are left alone — users discuss
 * a specific post by starting a thread on it.
 */

const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');

/** Channel IDs that should be media-only. */
const MEDIA_ONLY_CHANNELS = new Set([
  '1426746103797256192', // 📸︱ɢᴀᴍᴇʀs-ᴍᴇᴅɪᴀ
]);

const NOTICE_TTL_MS = 10_000;

/** Does this message qualify as "media"? */
function isMediaMessage(message) {
  // Direct file attachments (images, videos, audio, gifs)
  if (message.attachments && message.attachments.size > 0) {
    for (const att of message.attachments.values()) {
      const ct = att.contentType || '';
      const name = (att.name || '').toLowerCase();
      if (
        ct.startsWith('image/') ||
        ct.startsWith('video/') ||
        ct.startsWith('audio/') ||
        /\.(png|jpe?g|gif|webp|mp4|mov|webm|mkv|mp3|wav|ogg)$/i.test(name)
      ) {
        return true;
      }
    }
  }

  // Discord-rendered media via embed (e.g. Tenor GIF, image URL)
  // Only count auto-generated embeds, not the user typing a link with no media.
  // We can't perfectly tell at messageCreate time — embeds may not have
  // resolved yet. Conservative: count it as media if the message contains
  // a known media URL pattern.
  const content = String(message.content || '');
  if (/https?:\/\/\S+\.(png|jpe?g|gif|gifv|webp|mp4|mov|webm|mkv|mp3|wav|ogg)(\?\S*)?/i.test(content)) {
    return true;
  }
  if (/(tenor\.com\/view|giphy\.com\/(gifs|media)|cdn\.discordapp\.com\/attachments)/i.test(content)) {
    return true;
  }

  return false;
}

async function sendNotice(channel, member) {
  try {
    const notice = await channel.send({
      content:
        `${member} — this channel is **media only** (images, GIFs, videos).\n` +
        `**To comment on a post**, right-click the image → **Create Thread** and chat there.`,
      allowedMentions: { users: [member.id] },
    });
    setTimeout(() => {
      notice.delete().catch(() => {});
    }, NOTICE_TTL_MS);
  } catch (err) {
    // ignore — can't notify, but the deletion still happened
  }
}

function registerMediaOnlyChannelHandlers(client) {
  if (client._mediaOnlyRegistered) return;
  client._mediaOnlyRegistered = true;

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author?.bot) return;
      // Only top-level channel messages (not thread messages)
      if (message.channel?.isThread?.()) return;
      if (!MEDIA_ONLY_CHANNELS.has(message.channel.id)) return;

      if (isMediaMessage(message)) return; // allowed

      const me = message.guild.members.me;
      if (!me) return;
      if (!message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) {
        console.warn('[MEDIA-ONLY] Lacking ManageMessages in', message.channel.id);
        return;
      }

      await message.delete().catch(() => {});
      console.log(
        `[MEDIA-ONLY] Deleted text-only msg from ${message.author.tag} in #${message.channel.name}`,
      );

      const member = message.member ||
        (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (member) await sendNotice(message.channel, member);
    } catch (err) {
      console.error('[MEDIA-ONLY] handler error:', err.message);
    }
  });

  console.log(
    `[MEDIA-ONLY] Enforcing media-only on ${MEDIA_ONLY_CHANNELS.size} channel(s)`,
  );
}

module.exports = {
  registerMediaOnlyChannelHandlers,
  MEDIA_ONLY_CHANNELS,
  isMediaMessage,
};
