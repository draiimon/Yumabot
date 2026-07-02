const {
  checkVerifyReadiness,
  formatVerifyBlockMessage,
} = require('../intro/introSystem');
const {
  getGuildVerifyConfig,
  revokeVerified,
  isVerifyEmoji,
} = require('./verifySystem');

async function removeVerifyReaction(member, guildId) {
  const cfg = getGuildVerifyConfig(guildId);
  if (!cfg?.channelId || !cfg?.messageId) return;

  const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const message = await channel.messages.fetch(cfg.messageId).catch(() => null);
  if (!message) return;

  for (const reaction of message.reactions.cache.values()) {
    if (!isVerifyEmoji(reaction, cfg)) continue;
    const users = await reaction.users.fetch().catch(() => null);
    if (users?.has(member.id)) {
      await reaction.users.remove(member.id).catch(() => {});
    }
    break;
  }
}

/**
 * Remove Verified (and ✅ reaction) when intro / age / relationship / game picks are incomplete.
 */
async function enforceVerifiedEligibility(member, guildId, { client = null } = {}) {
  const cfg = getGuildVerifyConfig(guildId);
  if (!cfg?.roleId) return { revoked: false };

  const roleId = String(cfg.roleId);
  if (!member.roles.cache.has(roleId)) return { revoked: false };

  const readiness = await checkVerifyReadiness(member, guildId, {
    client: client || member.client,
  });
  if (readiness.ok) return { revoked: false };

  const result = await revokeVerified(member, roleId);
  if (!result.ok) {
    return { revoked: false, reason: result.reason };
  }

  if (result.already) {
    await removeVerifyReaction(member, guildId);
    const blockMsg = formatVerifyBlockMessage(readiness);
    await member
      .send(
        '**Your Verified access was removed.**\n\n' +
          'Member channels are locked again until you complete every requirement:\n' +
          '• **Age** + **Relationship** (buttons — tap again to remove)\n' +
          '• **At least one game or platform** (emoji reactions)\n' +
          '• **Full introduction** in the intro channel\n\n' +
          (blockMsg ? `${blockMsg}\n\n` : '') +
          '_When everything is done, react 👾 on the verify message again._',
      )
      .catch(() => {});
    console.log(
      `[VERIFY] Revoked ${member.user.tag} — ${readiness.blockers.map((b) => b.id).join(', ')}`,
    );
  }

  return { revoked: true, readiness };
}

module.exports = {
  enforceVerifiedEligibility,
  removeVerifyReaction,
};
