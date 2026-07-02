const fs = require('fs');
const path = require('path');
const { Events } = require('discord.js');
const { isVerifyEmoji } = require('../verify/verifySystem');
const VERIFY_CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'verify-config.json');

function getGuildVerifyConfig(guildId) {
  return loadJson(VERIFY_CONFIG_PATH, {})[String(guildId)] || null;
}

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'inactivity-config.json');
const ACTIVITY_PATH = path.join(__dirname, '..', '..', 'data', 'member-activity.json');

const DEFAULT_GUILD = '1426746102903738431';
const UNVERIFIED_ROLE_ID = '1426806943896309822';

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getInactivityConfig(guildId) {
  return loadJson(CONFIG_PATH, {})[String(guildId)] || null;
}

function activityKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getActivityRow(guildId, userId) {
  const all = loadJson(ACTIVITY_PATH, {});
  return all[activityKey(guildId, userId)] || null;
}

function getLastActiveMs(guildId, userId) {
  const row = getActivityRow(guildId, userId);
  if (row?.lastActiveAt) return new Date(row.lastActiveAt).getTime();
  // No activity data — treat as RECENTLY ACTIVE (Date.now()).
  // Falling back to cfg.startedAt caused mass-demotion after every Render
  // deploy because member-activity.json doesn't persist across deploys.
  // Members earn their 'inactive' status only after the bot has actually
  // observed them being silent for the full threshold post-deploy.
  return Date.now();
}

function patchActivityRow(guildId, userId, patch) {
  const all = loadJson(ACTIVITY_PATH, {});
  const key = activityKey(guildId, userId);
  all[key] = { ...(all[key] || {}), ...patch };
  saveJson(ACTIVITY_PATH, all);
}

function touchActivity(guildId, userId) {
  patchActivityRow(guildId, userId, {
    lastActiveAt: new Date().toISOString(),
    warnedAt: null,
  });
}

function clearActivityRow(guildId, userId) {
  const all = loadJson(ACTIVITY_PATH, {});
  const key = activityKey(guildId, userId);
  if (!all[key]) return false;
  delete all[key];
  saveJson(ACTIVITY_PATH, all);
  return true;
}

function verifyChannelMention(verifyCfg) {
  return verifyCfg?.channelId ? `<#${verifyCfg.channelId}>` : 'the **verify** channel';
}

/** DM when Verified is removed after 5 days inactive. */
function buildReverifyRequiredDm(member, verifyCfg) {
  const verifyCh = verifyChannelMention(verifyCfg);
  return (
    '**Re-verification required**\n\n' +
    `Hi **${member.displayName}**,\n\n` +
    `You have been **inactive for 5 days** (no chat and no voice activity in **${member.guild.name}**).\n\n` +
    'Your **Verified** role has been **removed**. Member channels are locked until you verify again.\n\n' +
    '**Your introduction and role-menu picks are still saved.**\n\n' +
    '**What to do:**\n' +
    `1. Open ${verifyCh}\n` +
    '2. React **👾** on the verification message\n\n' +
    'If your profile is still complete, access is restored **immediately**.\n\n' +
    'Check progress: `j!view`\n\n' +
    '_Tip: Chat or join voice at least once every **5 days** to keep Verified._'
  );
}

/** DM ~24h before Verified is removed. */
function buildInactivityWarningDm(member, verifyCfg, hoursLeft) {
  const verifyCh = verifyChannelMention(verifyCfg);
  const hrs = Math.max(1, Math.round(hoursLeft));
  return (
    '**Inactivity warning — action needed**\n\n' +
    `Hi **${member.displayName}**,\n\n` +
    `You have had **no chat or voice activity** in **${member.guild.name}** for almost **5 days**.\n\n` +
    `In about **${hrs} hour(s)**, your **Verified** role will be removed unless you:\n` +
    '• **Send a message** in the server, or\n' +
    '• **Join a voice channel**\n\n' +
    'If Verified is removed, you only need to **re-verify**:\n' +
    `Go to ${verifyCh} and react **👾** (your intro + roles stay saved).\n\n` +
    'Check progress: `j!view`'
  );
}

async function dmMember(user, text) {
  if (!user || user.bot) return false;
  try {
    await user.send(text);
    return true;
  } catch {
    return false;
  }
}

async function removeVerifyReaction(guild, verifyCfg, userId) {
  if (!verifyCfg?.channelId || !verifyCfg?.messageId) return;
  const channel = await guild.channels.fetch(verifyCfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const msg = await channel.messages.fetch(verifyCfg.messageId).catch(() => null);
  if (!msg) return;
  for (const reaction of msg.reactions.cache.values()) {
    if (!isVerifyEmoji(reaction, verifyCfg)) continue;
    await reaction.users.remove(userId).catch(() => {});
    break;
  }
}

async function revokeForInactivity(member, verifyCfg) {
  const roleId = String(verifyCfg.roleId);
  const role = member.guild.roles.cache.get(roleId);
  if (!role || !member.roles.cache.has(roleId)) return { ok: true, skipped: true };

  // DM dedupe: only send the "re-verify required" DM if we haven't already
  // sent one in the past 24h. Prevents spam when something keeps re-granting
  // Verified to an inactive member (e.g. the auto-verify reminder loop).
  const existingRow = getActivityRow(member.guild.id, member.id);
  const recentlyRevokedMs = existingRow?.revokedAt
    ? Date.now() - new Date(existingRow.revokedAt).getTime()
    : Infinity;
  const shouldDm = recentlyRevokedMs > 24 * 60 * 60 * 1000;

  await member.roles.remove(role, 'JanJan inactivity: 5+ days no chat/voice — re-verify required');

  // Add unverified role back so they get unverified-tier access until they re-verify
  if (!member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles
      .add(UNVERIFIED_ROLE_ID, 'JanJan inactivity: back to unverified')
      .catch((err) => console.warn('[INACTIVITY] Could not add unverified role:', err.message));
  }

  await removeVerifyReaction(member.guild, verifyCfg, member.id);

  // DMs disabled — the daily 10pm channel reminder in #verify-reminder
  // already covers this. Channel = single source of truth, no DM spam.
  patchActivityRow(member.guild.id, member.id, { warnedAt: null, revokedAt: new Date().toISOString() });

  console.log(`[INACTIVITY] Revoked verified from ${member.user.tag} (5d inactive)`);
  return { ok: true, notified: false };
}

async function sweepGuildInactivity(client, guildId) {
  const cfg = getInactivityConfig(guildId);
  if (!cfg?.enabled) return { checked: 0, revoked: 0 };

  const verifyCfg = getGuildVerifyConfig(guildId);
  if (!verifyCfg?.roleId) return { checked: 0, revoked: 0 };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { checked: 0, revoked: 0 };

  await guild.members.fetch().catch(() => {});
  const roleId = String(verifyCfg.roleId);
  const thresholdMs = (cfg.inactiveDays || 5) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const warnHours = cfg.warnHoursBefore ?? 24;
  const warnMs = warnHours * 60 * 60 * 1000;

  let checked = 0;
  let revoked = 0;
  let warned = 0;

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    if (!member.roles.cache.has(roleId)) continue;
    checked += 1;
    const last = getLastActiveMs(guildId, member.id);
    const inactiveMs = now - last;

    if (inactiveMs >= thresholdMs) {
      // 5-day inactivity rule active: demote silently (no DM).
      // The daily 10pm channel reminder will pick them up.
      await revokeForInactivity(member, verifyCfg);
      revoked += 1;
      continue;
    }
  }

  if (revoked > 0 || warned > 0) {
    console.log(`[INACTIVITY] Sweep ${guild.name}: checked ${checked}, revoked ${revoked}`);
  }
  return { checked, revoked, warned };
}

function startInactivityScheduler(client) {
  if (client._inactivitySchedulerStarted) return;
  client._inactivitySchedulerStarted = true;

  const run = async () => {
    const all = loadJson(CONFIG_PATH, {});
    for (const guildId of Object.keys(all)) {
      try {
        await sweepGuildInactivity(client, guildId);
      } catch (err) {
        console.error(`[INACTIVITY] Sweep ${guildId}:`, err.message);
      }
    }
  };

  const cfg = getInactivityConfig(DEFAULT_GUILD);
  const hours = cfg?.checkIntervalHours || 6;
  const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;

  run();
  setInterval(run, intervalMs);
  console.log(`[INACTIVITY] Scheduler every ${hours}h — ${cfg?.inactiveDays || 5} day inactive → remove Verified only`);
}

function registerInactivityHandlers(client) {
  if (client._inactivityHandlersRegistered) return;
  client._inactivityHandlersRegistered = true;

  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author?.bot) return;
      const verifyCfg = getGuildVerifyConfig(message.guild.id);
      if (!verifyCfg?.roleId) return;
      const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!member?.roles.cache.has(verifyCfg.roleId)) return;
      touchActivity(message.guild.id, message.author.id);
    } catch (err) {
      console.error('[INACTIVITY] messageCreate:', err.message);
    }
  });

  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      const guild = newState.guild || oldState.guild;
      if (!guild) return;
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const verifyCfg = getGuildVerifyConfig(guild.id);
      if (!verifyCfg?.roleId) return;
      if (!member.roles.cache.has(verifyCfg.roleId)) return;

      const joined = Boolean(newState.channelId);
      const left = Boolean(oldState.channelId);
      if (joined || left) {
        touchActivity(guild.id, member.id);
      }
    } catch (err) {
      console.error('[INACTIVITY] voiceStateUpdate:', err.message);
    }
  });

  console.log('[INACTIVITY] Activity tracking registered (chat + voice)');
}

module.exports = {
  DEFAULT_GUILD,
  getInactivityConfig,
  getGuildVerifyConfig,
  touchActivity,
  clearActivityRow,
  getLastActiveMs,
  patchActivityRow,
  getActivityRow,
  revokeForInactivity,
  buildReverifyRequiredDm,
  buildInactivityWarningDm,
  sweepGuildInactivity,
  startInactivityScheduler,
  registerInactivityHandlers,
};
