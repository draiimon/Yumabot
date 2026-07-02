const {
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { PermissionsBitField } = require('discord.js');
const { joinTtsVoiceChannel } = require('./joinTtsVoice');

async function resolveGuildMe(guild) {
  if (!guild) return null;
  if (guild.members.me) return guild.members.me;
  try {
    return await guild.members.fetchMe();
  } catch {
    return null;
  }
}

async function getVoicePermLabels(channel, guild) {
  const me = await resolveGuildMe(guild);
  if (!channel) return ['no-channel'];
  if (!me) return [];
  const perms = channel.permissionsFor(me);
  if (!perms) return ['cannot-resolve-permissions'];

  const required = [
    ['Connect', PermissionsBitField.Flags.Connect],
    ['Speak', PermissionsBitField.Flags.Speak],
    ['ViewChannel', PermissionsBitField.Flags.ViewChannel],
  ];
  return required.filter(([, flag]) => !perms.has(flag)).map(([label]) => label);
}

/**
 * Voice connect that respects in-progress handshakes.
 *
 * Key insight: if joinAndWatch (24/7 startup) is already negotiating a
 * connection to the same channel, DO NOT call joinVoiceChannel again —
 * that cancels the handshake and forces it to restart from signalling.
 * On slow networks (e.g. Render free tier), this restart loops forever.
 *
 * gnslgbot2 equivalent: discord.py's voice_client.is_connecting() check.
 */
async function ensureVoiceReady({
  guild,
  member,
  joinAndWatch,
  timeoutMs = 30000,
  useTtsJoin = true,
}) {
  if (!guild || !member?.voice?.channel) {
    const err = new Error('not-in-voice');
    err.code = 'not-in-voice';
    throw err;
  }

  const guildId = guild.id;
  const targetChannel = member.voice.channel;

  const missingPerms = await getVoicePermLabels(targetChannel, guild);
  if (missingPerms.length > 0) {
    const err = new Error('missing-voice-perms');
    err.code = 'missing-voice-perms';
    err.missing = missingPerms;
    throw err;
  }

  let connection = getVoiceConnection(guildId);
  const sameChannel = connection?.joinConfig?.channelId === targetChannel.id;
  const status = connection?.state?.status;

  // Case A: existing connection to same channel.
  if (connection && sameChannel) {
    // Already ready — reuse.
    if (status === VoiceConnectionStatus.Ready) return connection;

    // Mid-handshake — DO NOT re-join, just wait. (Re-joining cancels the handshake.)
    if (
      status === VoiceConnectionStatus.Connecting ||
      status === VoiceConnectionStatus.Signalling
    ) {
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, timeoutMs);
        return connection;
      } catch (err) {
        const msg = String(err?.message || '');
        const wrapped = new Error(msg || 'voice-timeout');
        wrapped.code = /aborted/i.test(msg) ? 'voice-aborted' : 'voice-timeout';
        throw wrapped;
      }
    }

    // Destroyed / Disconnected — fall through to fresh join.
  }

  // Case B: no connection, or stale connection. Fresh join.
  if (useTtsJoin) {
    connection = joinTtsVoiceChannel({
      channelId: targetChannel.id,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
    });
  } else if (typeof joinAndWatch === 'function') {
    connection = joinAndWatch(targetChannel.id, guildId, guild.voiceAdapterCreator);
  }

  if (!connection) {
    const err = new Error('join-failed');
    err.code = 'join-failed';
    throw err;
  }

  if (connection.state.status === VoiceConnectionStatus.Ready) {
    return connection;
  }

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, timeoutMs);
    return connection;
  } catch (err) {
    const msg = String(err?.message || '');
    const wrapped = new Error(msg || 'voice-timeout');
    wrapped.code = /aborted/i.test(msg) ? 'voice-aborted' : 'voice-timeout';
    throw wrapped;
  }
}

module.exports = { ensureVoiceReady, getVoicePermLabels };
