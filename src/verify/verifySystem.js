const fs = require('fs');
const path = require('path');
const {
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder,
} = require('discord.js');
const { buildVerifyEmbed } = require('./badingVerifyEmbed');
const { generateChannelBanner } = require('../welcome/welcomeCanvas');
const {
  checkVerifyReadiness,
  formatVerifyBlockMessage,
  getIntroChannelId,
} = require('../intro/introSystem');
const lastVerifyRevokeDmAt = new Map();

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'verify-config.json');
const VERIFY_EMOJI = '👾';
const DEFAULT_GUILD = '1426746102903738431';
const DEFAULT_VERIFIED_ROLE = '1426746102903738432';

function loadVerifyConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveVerifyConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function getGuildVerifyConfig(guildId) {
  const all = loadVerifyConfig();
  return all[String(guildId)] || null;
}

function getPublicChannelSets(cfg, verifyChannelId) {
  const publicIds = new Set(
    [...(cfg?.publicChannelIds || []), verifyChannelId].map(String),
  );
  const chatIds = new Set((cfg?.chatChannelIds || []).map(String));
  return { publicIds, chatIds };
}

/** Channels unverified members may see (and optionally chat in). */
async function applyPublicChannelAccess(guild, cfg, verifyChannelId, verifiedRoleId) {
  const everyone = guild.roles.everyone;
  const verifiedRole = guild.roles.cache.get(verifiedRoleId);
  const { publicIds, chatIds } = getPublicChannelSets(cfg, verifyChannelId);

  for (const channelId of publicIds) {
    const ch = guild.channels.cache.get(channelId);
    if (!ch?.permissionOverwrites) continue;

    const canChat = chatIds.has(channelId);
    const isVerifyCh = channelId === String(verifyChannelId);
    try {
      await ch.permissionOverwrites.edit(everyone, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: canChat,
        AddReactions: isVerifyCh || canChat,
      });
      if (verifiedRole) {
        await ch.permissionOverwrites.edit(verifiedRole, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          AddReactions: true,
        });
      }
      const mode = canChat
        ? 'view + chat + react'
        : isVerifyCh
          ? 'view + react (no chat)'
          : 'view only';
      console.log(`[VERIFY] Public channel #${ch.name}: everyone ${mode}`);
    } catch (err) {
      console.warn(`[VERIFY] Public channel ${channelId}:`, err.message);
    }
  }
}

async function applyServerLock(guild, verifyChannelId, verifiedRoleId, cfg = {}) {
  const everyone = guild.roles.everyone;
  const verifiedRole = guild.roles.cache.get(verifiedRoleId);
  if (!verifiedRole) {
    throw new Error(`Verified role ${verifiedRoleId} not found`);
  }

  const { publicIds } = getPublicChannelSets(cfg, verifyChannelId);

  let updated = 0;
  for (const channel of guild.channels.cache.values()) {
    if (publicIds.has(channel.id)) continue;
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.GuildStageVoice &&
      channel.type !== ChannelType.GuildForum
    ) {
      continue;
    }

    try {
      await channel.permissionOverwrites.edit(everyone, {
        ViewChannel: false,
      });
      await channel.permissionOverwrites.edit(verifiedRole, {
        ViewChannel: true,
      });
      updated += 1;
    } catch (err) {
      console.warn(`[VERIFY] Could not lock ${channel.name}:`, err.message);
    }
  }

  await applyPublicChannelAccess(guild, cfg, verifyChannelId, verifiedRoleId);

  return updated;
}

async function setupVerifyChannel(client, {
  guildId = DEFAULT_GUILD,
  verifiedRoleId = DEFAULT_VERIFIED_ROLE,
  channelName = '🔒︱verify',
  lockServer = true,
}) {
  const guild = await client.guilds.fetch(guildId);
  const me = guild.members.me || (await guild.members.fetchMe());

  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    throw new Error('Bot needs Manage Channels permission');
  }
  if (lockServer && !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    throw new Error('Bot needs Manage Roles permission to lock channels');
  }

  let channel = guild.channels.cache.find(
    (c) => c.name === channelName || c.name === 'verify',
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: 'Server verification — react 👾 to gain access; removing 👾 revokes access',
      reason: 'JanJan verify setup',
    });
  }

  const embed = buildVerifyEmbed(guild.name, guildId);

  // Send as the server (webhook)
  const webhooks = await channel.fetchWebhooks();
  let hook = webhooks.find((w) => w.owner?.id === client.user.id && w.name === guild.name);
  if (!hook) {
    const iconURL = guild.iconURL({ size: 256, extension: 'png' });
    const avatarResponse = iconURL ? await fetch(iconURL) : null;
    const avatarBuffer = avatarResponse?.ok ? Buffer.from(await avatarResponse.arrayBuffer()) : null;
    hook = await channel.createWebhook({
      name: guild.name,
      avatar: avatarBuffer ?? undefined,
      reason: 'JanJan verify panel — server identity',
    });
  }

  const { buffer, filename } = await generateChannelBanner({
    title: 'VERIFICATION',
    subtitle: 'Complete all steps to unlock the server',
    accentHex: '#eb459e',
    filename: 'verify-banner.gif',
  });

  const whMsg = await hook.send({
    files: [new AttachmentBuilder(buffer, { name: filename })],
    embeds: [embed],
  });
  // Bot fetches the sent message to react on it
  const msg = await channel.messages.fetch(whMsg.id);
  await msg.react(VERIFY_EMOJI);

  const config = loadVerifyConfig();
  const prev = config[String(guildId)] || {};
  config[String(guildId)] = {
    ...prev,
    channelId: channel.id,
    messageId: msg.id,
    roleId: verifiedRoleId,
    emoji: VERIFY_EMOJI,
    lockServer: Boolean(lockServer),
    publicChannelIds: (() => {
      const pub = new Set([
        channel.id,
        '1426746103616897125',
        '1426746103616897130',
        ...(prev.publicChannelIds || []),
      ]);
      const introId = getIntroChannelId(guildId);
      if (introId) pub.add(introId);
      return [...pub];
    })(),
    chatChannelIds: (() => {
      const chat = new Set(prev.chatChannelIds || []);
      const introId = getIntroChannelId(guildId);
      if (introId) chat.add(introId);
      return [...chat];
    })(),
  };
  saveVerifyConfig(config);

  let locked = 0;
  if (lockServer) {
    locked = await applyServerLock(guild, channel.id, verifiedRoleId, config[String(guildId)]);
  }

  return { channel, message: msg, lockedChannels: locked, verifiedRoleId };
}

const UNVERIFIED_ROLE_ID = '1426806943896309822';

async function grantVerified(member, verifiedRoleId) {
  const role = member.guild.roles.cache.get(verifiedRoleId);
  if (!role) return { ok: false, reason: 'role-not-found' };

  // Remove the unverified role (if they have it) and add Verified
  if (member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles
      .remove(UNVERIFIED_ROLE_ID, 'JanJan verify: graduated from unverified')
      .catch((err) => console.warn('[VERIFY] Could not remove unverified role:', err.message));
  }

  if (member.roles.cache.has(verifiedRoleId)) {
    return { ok: true, already: true };
  }
  await member.roles.add(role, 'JanJan verify: reaction added');
  return { ok: true, already: false };
}

async function revokeVerified(member, verifiedRoleId) {
  const roleId = String(verifiedRoleId);
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return { ok: false, reason: 'role-not-found' };

  const me = member.guild.members.me;
  if (me && me.roles.highest.position <= role.position) {
    console.error(
      `[VERIFY] Cannot remove role ${roleId}: drag bot role ABOVE "Verified" in Server Settings → Roles`,
    );
    return { ok: false, reason: 'role-hierarchy' };
  }

  // Add unverified role back when Verified is removed
  if (!member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles
      .add(UNVERIFIED_ROLE_ID, 'JanJan verify: revoked — back to unverified')
      .catch((err) => console.warn('[VERIFY] Could not add unverified role:', err.message));
  }

  if (!member.roles.cache.has(roleId)) {
    return { ok: true, already: false };
  }

  await member.roles.remove(role, 'JanJan verify: ✅ reaction removed — access revoked');
  console.log(`[VERIFY] Removed role ${roleId} from ${member.user.tag} — channels no longer viewable`);
  return { ok: true, already: true };
}

function isVerifyEmoji(reaction, cfg) {
  const name = reaction.emoji?.name;
  const str = reaction.emoji?.toString?.() || '';
  const cfgEmoji = cfg?.emoji || VERIFY_EMOJI;
  if (name === '👾' || str === '👾') return true;
  if (name === cfgEmoji || str === cfgEmoji) return true;
  return false;
}

async function fetchReactionContext(reaction, user) {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.warn('[VERIFY] reaction fetch failed:', err.message);
      return null;
    }
  }
  if (user?.partial) {
    try {
      await user.fetch();
    } catch {
      return null;
    }
  }

  let message = reaction.message;
  if (message?.partial) {
    message = await message.fetch().catch(() => null);
  }
  if (!message?.guild) return null;

  const cfg = getGuildVerifyConfig(message.guild.id);
  if (!cfg?.channelId || !cfg?.messageId) return null;

  // ✅ only counts on the official verify post — not intro, get-role, or random chat.
  if (String(message.channel.id) !== String(cfg.channelId)) return null;
  if (String(message.id) !== String(cfg.messageId)) return null;

  if (!isVerifyEmoji(reaction, cfg)) return null;

  return { message, cfg, guild: message.guild };
}

async function handleVerifyReactionAdd(reaction, user) {
  if (user.bot) return;
  const ctx = await fetchReactionContext(reaction, user);
  if (!ctx) return;

  const member = await ctx.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const readiness = await checkVerifyReadiness(member, ctx.guild.id, { client: ctx.guild.client });
  if (!readiness.ok) {
    await reaction.users.remove(user.id).catch(() => {});
    const blockMsg = formatVerifyBlockMessage(readiness);
    console.log(`[VERIFY] Blocked ${user.tag}: ${readiness.blockers.map((b) => b.id).join(', ')}`);
    await user.send(blockMsg).catch(() => {});
    return;
  }

  const roleId = String(ctx.cfg.roleId);
  const result = await grantVerified(member, roleId);
  if (result.ok && !result.already) {
    console.log(`[VERIFY] Granted role ${roleId} to ${user.tag}`);
    // No DM — the channel reaction + role assignment is feedback enough.
    // (Previously sent: "You have been verified and granted access..." DM.)
  }
}

async function handleVerifyReactionRemove(reaction, user) {
  if (user.bot) return;
  const ctx = await fetchReactionContext(reaction, user);
  if (!ctx) return;

  const member = await ctx.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const roleId = String(ctx.cfg.roleId);

  const result = await revokeVerified(member, roleId);
  if (result.ok && result.already) {
    console.log(`[VERIFY] Revoked role ${roleId} from ${user.tag} (reaction removed)`);
    // No DM — they manually removed the reaction, they know what they did.
  } else if (!result.ok) {
    console.error(`[VERIFY] Failed to revoke ${roleId} from ${user.tag}: ${result.reason}`);
  }
}

async function refreshVerifyMessage(client, guildId) {
  const cfg = getGuildVerifyConfig(guildId);
  if (!cfg?.channelId || !cfg?.messageId) {
    throw new Error('No verify config for this server. Run j!setupverify first.');
  }
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(cfg.channelId);
  const message = await channel.messages.fetch(cfg.messageId);
  const embed = buildVerifyEmbed(guild.name, guildId);
  await message.edit({ embeds: [embed] });
  return message;
}

function registerVerifyHandlers(client) {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      await handleVerifyReactionAdd(reaction, user);
    } catch (err) {
      console.error('[VERIFY] reaction add error:', err.message);
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    try {
      await handleVerifyReactionRemove(reaction, user);
    } catch (err) {
      console.error('[VERIFY] reaction remove error:', err.message);
    }
  });

  console.log('[VERIFY] Reaction verify handlers registered (add + remove)');
}

async function repairVerifyPermissions(client, guildId) {
  const cfg = getGuildVerifyConfig(guildId);
  if (!cfg?.channelId || !cfg?.roleId) {
    throw new Error('No verify config. Run j!setupverify first.');
  }
  const guild = await client.guilds.fetch(guildId);
  await applyServerLock(guild, cfg.channelId, cfg.roleId, cfg);
  return cfg;
}

module.exports = {
  setupVerifyChannel,
  registerVerifyHandlers,
  getGuildVerifyConfig,
  loadVerifyConfig,
  applyServerLock,
  applyPublicChannelAccess,
  repairVerifyPermissions,
  grantVerified,
  revokeVerified,
  refreshVerifyMessage,
  DEFAULT_GUILD,
  DEFAULT_VERIFIED_ROLE,
  VERIFY_EMOJI,
  isVerifyEmoji,
};
