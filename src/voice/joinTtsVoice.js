const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

/**
 * Simple voice join — same flow as gnslgbot2's `await voice_channel.connect()`.
 * No destroy logic, no retries. @discordjs/voice handles internal state
 * (same channel = reuse, different channel = switch).
 */
function joinTtsVoiceChannel({ channelId, guildId, adapterCreator }) {
  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  connection.on('error', (err) => {
    console.error(`[TTS-VOICE] Connection error guild ${guildId}:`, err.message);
  });

  return connection;
}

async function waitTtsVoiceReady(guildId, timeoutMs = 35000) {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    return { ok: false, reason: 'no-connection' };
  }
  if (connection.state.status === VoiceConnectionStatus.Ready) {
    return { ok: true, connection };
  }
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, timeoutMs);
    return { ok: true, connection };
  } catch (err) {
    return { ok: false, reason: 'not-ready', error: err };
  }
}

module.exports = { joinTtsVoiceChannel, waitTtsVoiceReady };
