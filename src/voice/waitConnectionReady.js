const {
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

async function waitConnectionReady(guildId, timeoutMs = 15000) {
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

module.exports = { waitConnectionReady };
