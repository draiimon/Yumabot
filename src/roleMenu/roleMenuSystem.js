const fs = require('fs');
const path = require('path');
const { PermissionsBitField, Events, AttachmentBuilder } = require('discord.js');
const { buildAllEmbeds, reactFor, GAME_PARTS } = require('./roleMenuEmbed');
const { buildAgeButtonComponents, buildRelationshipButtonComponents, buildIdentityButtonComponents, parseButtonCustomId } = require('./roleMenuButtons');
const { allEntries, GROUPS } = require('./definitions');
const {
  ensureGuildEmojisForEntries,
  applyIconMapToMappings,
  findExistingAppEmoji,
} = require('./guildEmojiIcons');
const { getRoleDiscordName, getRoleColor, roleNameMatchesEntry } = require('./roleStyle');
const { generateRoleMenuBannerGif } = require('../welcome/welcomeCanvas');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'role-menu-config.json');
const DEFAULT_GUILD = '1426746102903738431';
const DEFAULT_CHANNEL = '1426746103616897130';
const DEFAULT_MESSAGE = '1426856978608816253';

function loadRoleMenuConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveRoleMenuConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function getGuildRoleMenuConfig(guildId) {
  return loadRoleMenuConfig()[String(guildId)] || null;
}

function normalizeRoleName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const SKIP_ROLE_IDS = new Set(['1426746102903738432', '1426806943896309822']); // Verified + Unverified

/** intro · age · relationship · games 1/3 · games 2/3 · games 3/3 */
const ROLE_MENU_MESSAGE_COUNT = 6;
const GAME_MSG_START_IDX = 3;

async function isBumperMenuMessage(channel, messageId) {
  if (!messageId) return false;
  const m = await channel.messages.fetch(messageId).catch(() => null);
  return m?.embeds?.[0]?.title === 'Bumper';
}

async function normalizeRoleMenuMessageIds(channel, ids) {
  let next = [...(ids || [])];
  while (next.length > 0 && (await isBumperMenuMessage(channel, next[next.length - 1]))) {
    next.pop();
  }
  if (next.length === 5 && next[4] && (await isBumperMenuMessage(channel, next[4]))) {
    next = [next[0], next[1], next[2], next[3], null];
  }
  while (next.length < ROLE_MENU_MESSAGE_COUNT) next.push(null);
  return next.slice(0, ROLE_MENU_MESSAGE_COUNT);
}

function findRoleByEntry(guild, entry, existingMappings = null) {
  const fromConfig = existingMappings?.[entry.key]?.roleId;
  if (fromConfig) {
    const byId = guild.roles.cache.get(fromConfig);
    if (byId && !SKIP_ROLE_IDS.has(byId.id)) return byId;
  }
  const discordName = getRoleDiscordName(entry);
  for (const role of guild.roles.cache.values()) {
    if (role.managed || role.name === '@everyone') continue;
    if (SKIP_ROLE_IDS.has(role.id)) continue;
    if (role.name === discordName || roleNameMatchesEntry(role.name, entry)) return role;
  }
  return null;
}

async function syncRoleAppearance(role, entry) {
  const name = getRoleDiscordName(entry);
  const color = getRoleColor(entry.key);
  const patch = {};
  if (role.name !== name) patch.name = name;
  if (role.color !== color) patch.color = color;
  if (!role.mentionable) patch.mentionable = true;
  if (Object.keys(patch).length) {
    await role.edit({ ...patch, reason: 'JanJan role menu: styled name + color' });
    console.log(`[ROLE-MENU] Updated role: ${name}`);
  }
}

async function syncAllRoleAppearances(guild, mappings = null) {
  const cfg = getGuildRoleMenuConfig(guild.id);
  const map = mappings || cfg?.mappings || {};
  const entries = allEntries();
  let n = 0;
  for (const entry of entries) {
    n += 1;
    const roleId = map[entry.key]?.roleId;
    const role = roleId ? guild.roles.cache.get(roleId) : findRoleByEntry(guild, entry, map);
    if (!role) continue;
    process.stdout.write(`[ROLE-MENU] Styling ${n}/${entries.length} ${entry.key}…\r`);
    await syncRoleAppearance(role, entry).catch((err) => {
      console.warn(`\n[ROLE-MENU] Style ${entry.key}:`, err.message);
    });
    await new Promise((r) => setTimeout(r, 350));
  }
  console.log(`\n[ROLE-MENU] Styled ${entries.length} roles.`);
}

async function ensureRoles(guild, createMissing = true, { syncAppearance = false } = {}) {
  const me = guild.members.me || (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    throw new Error('Bot needs Manage Roles to create or assign roles');
  }

  const cfg = getGuildRoleMenuConfig(guild.id);
  const existingMappings = sanitizeMappingsMap(cfg?.mappings || {});
  const entries = allEntries();

  const mapping = {};
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const displayName = getRoleDiscordName(entry);
    const color = getRoleColor(entry.key);
    let role = findRoleByEntry(guild, entry, existingMappings);
    if (!role && createMissing) {
      role = await guild.roles.create({
        name: displayName,
        color,
        mentionable: true,
        reason: 'JanJan role menu auto-setup',
      });
      console.log(`[ROLE-MENU] Created role (${i + 1}/${entries.length}): ${displayName}`);
    } else if (role && syncAppearance) {
      await syncRoleAppearance(role, entry).catch((err) => {
        console.warn(`[ROLE-MENU] Could not style ${entry.key}:`, err.message);
      });
      await new Promise((r) => setTimeout(r, 350));
    }
    if (role) {
      const prev = sanitizeMappingMeta(existingMappings[entry.key], entry);
      const isGame = entry.key.startsWith('g_');
      mapping[entry.key] = {
        roleId: role.id,
        emoji: isGame && prev?.emojiId ? prev.emoji : entry.emoji,
        react: isGame && prev?.emojiId ? prev.react ?? prev.emojiId : entry.emoji,
        emojiId: isGame ? prev?.emojiId : undefined,
        emojiDisplay: isGame && prev?.emojiDisplay ? prev.emojiDisplay : entry.emoji,
        group: findGroupForKey(entry.key),
      };
    } else {
      console.warn(`[ROLE-MENU] Missing role for: ${entry.roleName}`);
    }
  }
  return mapping;
}

function findGroupForKey(key) {
  for (const [groupId, group] of Object.entries(GROUPS)) {
    if (group.type === 'info') continue;
    if (group.entries.some((e) => e.key === key)) return groupId;
  }
  return null;
}

/** Drop corrupted rows (Verified roleId, removed bumper, unknown keys). */
function sanitizeMappingMeta(meta, entry) {
  if (!meta || !entry) return null;
  if (SKIP_ROLE_IDS.has(String(meta.roleId))) return null;
  if (entry.key === 'bumper') return null;
  if (entry.key.startsWith('age_') || entry.key.startsWith('rel_')) {
    return { roleId: meta.roleId };
  }
  return meta;
}

function sanitizeMappingsMap(mappings, { stripGameEmojis = false } = {}) {
  const out = {};
  for (const entry of allEntries()) {
    const clean = sanitizeMappingMeta(mappings?.[entry.key], entry);
    if (!clean) continue;
    if (stripGameEmojis && entry.key.startsWith('g_')) {
      out[entry.key] = {
        roleId: clean.roleId,
        emoji: entry.emoji,
        react: entry.emoji,
        group: findGroupForKey(entry.key),
      };
    } else {
      out[entry.key] = clean;
    }
  }
  return out;
}

function getGroupType(cfg, groupId) {
  if (!groupId || !GROUPS[groupId]) return 'multi';
  return GROUPS[groupId].type;
}

function getKeysInGroup(cfg, groupId) {
  return Object.entries(cfg.mappings || {})
    .filter(([, v]) => v.group === groupId)
    .map(([k]) => k);
}

function keyFromAppEmojiName(name) {
  if (!name?.startsWith('rm_')) return null;
  return name.slice(3);
}

function resolveEntryFromReaction(cfg, reaction, messageId) {
  const emojiName = reaction.emoji?.name;
  const emojiId = reaction.emoji?.id;
  const preserved = (cfg.preservedMessageIds || []).map(String);
  if (preserved.includes(String(messageId))) {
    const leg = cfg.legacyMappings?.[emojiName];
    if (leg) return { key: `legacy_${emojiName}`, ...leg };
  }

  const fromName = keyFromAppEmojiName(emojiName);
  if (fromName && cfg.mappings[fromName]?.roleId) {
    return { key: fromName, ...cfg.mappings[fromName] };
  }

  const unicode = reaction.emoji?.identifier || emojiName;
  for (const [key, meta] of Object.entries(cfg.mappings || {})) {
    if (emojiId && meta.emojiId && String(meta.emojiId) === String(emojiId)) {
      return { key, ...meta, group: meta.group || findGroupForKey(key) };
    }
    if (emojiId && meta.react && String(meta.react) === String(emojiId)) {
      return { key, ...meta, group: meta.group || findGroupForKey(key) };
    }
    if (!emojiId && meta.react && String(meta.react) === String(unicode)) {
      return { key, ...meta, group: meta.group || findGroupForKey(key) };
    }
    if (!emojiId && meta.emoji && meta.emoji === unicode) {
      return { key, ...meta, group: meta.group || findGroupForKey(key) };
    }
    if (meta.emoji === emojiName) return { key, ...meta, group: meta.group || findGroupForKey(key) };
  }
  return null;
}

/** Sync emojiId/react from live message reactions into config mappings. */
async function syncMappingsFromReactions(channel, cfg, mappings) {
  const out = { ...mappings };
  const ids = (cfg.messageIds || []).filter(Boolean);

  for (let idx = 0; idx < ids.length; idx += 1) {
    if (idx === 1) continue;
    const msg = await channel.messages.fetch(ids[idx], { force: true }).catch(() => null);
    if (!msg) continue;

    for (const reaction of msg.reactions.cache.values()) {
      if (reaction.partial) await reaction.fetch().catch(() => {});
      const { name, id } = reaction.emoji;
      let key = keyFromAppEmojiName(name);
      if (!key && id) {
        key = Object.entries(out).find(([, m]) => String(m.emojiId) === String(id))?.[0];
      }
      if (!key || !out[key]?.roleId) continue;
      out[key] = {
        ...out[key],
        emoji: name || out[key].emoji,
        emojiId: id || out[key].emojiId,
        react: id || name || out[key].react,
        emojiDisplay: id && name ? `<:${name}:${id}>` : out[key].emojiDisplay,
        group: out[key].group || findGroupForKey(key),
      };
    }
  }
  return out;
}

function findReaction(message, meta) {
  if (!meta) return null;
  if (meta.emojiId) {
    return message.reactions.cache.find((r) => r.emoji.id === meta.emojiId) || null;
  }
  return message.reactions.cache.get(meta.emoji) || null;
}

function buildLegacyPlatformMappings(guild) {
  const legacy = {
    '🖥️': ['pc', 'ᴘᴄ'],
    '🎮': ['console', 'ᴄᴏɴsᴏʟᴇ'],
    '📱': ['phone', 'ᴘʜᴏɴᴇ', 'mobile'],
  };
  const out = {};
  for (const [emoji, names] of Object.entries(legacy)) {
    const role = [...guild.roles.cache.values()].find((r) => {
      const n = normalizeRoleName(r.name);
      return names.some((x) => n === normalizeRoleName(x) || n.includes(normalizeRoleName(x)));
    });
    if (role) {
      out[emoji] = { roleId: role.id, emoji, group: 'platform', type: 'multi' };
    }
  }
  return out;
}

function isRoleMenuMessage(cfg, messageId) {
  if (!cfg) return false;
  const ids = new Set([
    cfg.messageId,
    ...(cfg.messageIds || []),
    ...(cfg.preservedMessageIds || []),
  ].filter(Boolean).map(String));
  return ids.has(String(messageId));
}

async function clearBotReactions(message, client) {
  const botId = client.user?.id;
  if (!botId) return 0;
  let removed = 0;
  await message.fetch(true).catch(() => {});
  for (const reaction of [...message.reactions.cache.values()]) {
    try {
      const users = await reaction.users.fetch();
      if (users.has(botId)) {
        await reaction.users.remove(botId);
        removed += 1;
      }
    } catch {
      await reaction.users.remove(botId).catch(() => {});
      removed += 1;
    }
  }
  return removed;
}

function messageHasReaction(message, entry, iconMap) {
  const ic = iconMap?.[entry.key];
  if (ic?.id) {
    return message.reactions.cache.some((r) => r.emoji?.id === ic.id);
  }
  return message.reactions.cache.has(entry.emoji);
}

async function resolveReactionTarget(client, entry, iconMap) {
  const ic = iconMap?.[entry.key];
  if (ic?.id && client) {
    const emoji = client.application.emojis.cache.get(ic.id);
    if (emoji) return emoji;
    return ic.id;
  }
  return reactFor(entry, iconMap);
}

/** Add only missing bot reactions (refetches message so cache stays accurate). */
async function ensureReactionsOnMessage(message, entries, iconMap, client, { delayMs = 600 } = {}) {
  await client.application.fetch();
  await client.application.emojis.fetch().catch(() => {});
  let added = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    await message.fetch(true).catch(() => {});
    if (messageHasReaction(message, entry, iconMap)) continue;
    const target = await resolveReactionTarget(client, entry, iconMap);
    try {
      await message.react(target);
      added += 1;
    } catch (err) {
      console.warn(`[ROLE-MENU] Could not react ${entry.key}:`, err.message);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return added;
}

/** Wipe bot reactions then add every game icon fresh (fixes stale emoji / 20-cap confusion). */
async function replaceReactionsOnMessage(message, entries, iconMap, client, { delayMs = 700 } = {}) {
  await client.application.fetch();
  await client.application.emojis.fetch().catch(() => {});

  const cleared = await clearBotReactions(message, client);
  await message.fetch(true).catch(() => {});

  let ok = 0;
  let fail = 0;
  for (const entry of entries) {
    const target = await resolveReactionTarget(client, entry, iconMap);
    try {
      await message.react(target);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.warn(`[ROLE-MENU] replace react ${entry.key}:`, err.message);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  await message.fetch(true).catch(() => {});
  const count = message.reactions.cache.size;
  console.log(
    `[ROLE-MENU] Reactions on ${message.id}: cleared ${cleared}, added ${ok}/${entries.length}, failed ${fail}, now ${count} on message`,
  );
  return { ok, fail, count };
}

async function addReactionsToMessage(message, entries, iconMap, client) {
  await ensureReactionsOnMessage(message, entries, iconMap, client, { delayMs: 600 });
}

function iconMapFromStoredMappings(mappings) {
  const map = {};
  for (const [key, meta] of Object.entries(mappings || {})) {
    if (meta.emojiId) {
      map[key] = {
        id: meta.emojiId,
        name: meta.emoji,
        display: meta.emojiDisplay,
        react: meta.emojiId,
      };
    } else if (meta.emoji) {
      map[key] = { display: meta.emoji, react: meta.emoji, name: meta.emoji };
    }
  }
  return map;
}

/**
 * Find a webhook in `channel` by exact name or fuzzy (strips Unicode decoration).
 * Returns the Webhook object (has .send / .editMessage) or null.
 */
async function resolveWebhookSender(channel, webhookName) {
  if (!webhookName) return null;
  const hooks = await channel.fetchWebhooks().catch(() => null);
  if (!hooks) return null;
  const norm = (s) => String(s).toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
  const target = norm(webhookName);
  return hooks.find((w) => w.name === webhookName || norm(w.name) === target) || null;
}

/**
 * Build embed display options.
 * thumbnailUrl = webhook avatar (server logo) for upper-right on all embeds.
 * withBanner = true so every embed gets setImage('attachment://role-banner.png').
 */
function buildEmbedOptions(guild, iconMap, sender) {
  const thumbnailUrl =
    (sender?.avatarURL({ size: 256, extension: 'png' })) ||
    guild.iconURL({ size: 256 }) ||
    null;
  return { thumbnailUrl, withBanner: true };
}

/** Section titles for the 5 role-menu messages (index matches message order). */
const SECTION_TITLES = [
  'Community Roles',
  'Age',
  'Relationship',
  'Games (1/3)',
  'Games (2/3)',
  'Games (3/3)',
];

/** Generate one animated GIF banner per section. */
async function generateSectionBanners(guild) {
  return Promise.all(
    SECTION_TITLES.map((sectionTitle) =>
      generateRoleMenuBannerGif({ sectionTitle, serverName: guild.name }),
    ),
  );
}

/** Wrap a banner buffer into an AttachmentBuilder. */
function bannerFile(buf) {
  return new AttachmentBuilder(buf, { name: 'role-banner.gif' });
}

async function setupRoleMenu(client, {
  guildId = DEFAULT_GUILD,
  channelId = DEFAULT_CHANNEL,
  editMessageId = DEFAULT_MESSAGE,
  createRoles = true,
  webhookName = null,
} = {}) {
  const guild = await client.guilds.fetch(guildId);
  const me = guild.members.me || (await guild.members.fetchMe());
  await guild.roles.fetch();
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Invalid text channel');

  // Resolve webhook sender (falls back to bot if not found).
  const sender = await resolveWebhookSender(channel, webhookName);
  if (webhookName && !sender) {
    console.warn(`[ROLE-MENU] Webhook "${webhookName}" not found — falling back to bot.`);
  } else if (sender) {
    console.log(`[ROLE-MENU] Using webhook "${sender.name}" (${sender.id}) to post messages.`);
  }

  // Delete existing role-menu messages (bot or webhook-owned) before re-posting.
  const prevConfig = loadRoleMenuConfig()[String(guildId)] || {};
  for (const id of prevConfig.messageIds || []) {
    const old = await channel.messages.fetch(id).catch(() => null);
    if (!old) continue;
    const isBotMsg = old.author?.id === client.user.id;
    const isOwnWebhook = old.webhookId && (
      (sender && String(old.webhookId) === String(sender.id)) ||
      (prevConfig.webhookId && String(old.webhookId) === String(prevConfig.webhookId))
    );
    if (isBotMsg || isOwnWebhook) {
      await old.delete().catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  let mappings = await ensureRoles(guild, createRoles);
  const iconMap = await ensureGuildEmojisForEntries(guild, allEntries(), { upload: true });
  mappings = applyIconMapToMappings(mappings, iconMap);
  const embeds = buildAllEmbeds(guild.name, iconMap, buildEmbedOptions(guild, iconMap, sender));

  console.log('[ROLE-MENU] Generating banner GIFs for all sections…');
  const bannerBuffers = await generateSectionBanners(guild);

  // Never delete other users' messages — only post new bot messages.
  const preservedIds = [];
  if (editMessageId) {
    const old = await channel.messages.fetch(editMessageId).catch(() => null);
    if (old) preservedIds.push(String(editMessageId));
  }

  /** Send via webhook (preferred) or bot, attaching the section banner. */
  const sendMsg = async (msgIdx, payload) => {
    const files = bannerBuffers[msgIdx] ? [bannerFile(bannerBuffers[msgIdx])] : [];
    const full = { ...payload, files };
    if (sender) {
      const wMsg = await sender.send(full);
      return await channel.messages.fetch(wMsg.id).catch(() => wMsg);
    }
    return await channel.send(full);
  };

  const messages = [];
  const introMsg = await sendMsg(0, { embeds: [embeds[0]] });
  messages.push(introMsg);

  const ageMsg = await sendMsg(1, {
    embeds: [embeds[1]],
    components: buildAgeButtonComponents(),
  });
  messages.push(ageMsg);

  const relMsg = await sendMsg(2, {
    embeds: [embeds[2]],
    components: buildRelationshipButtonComponents(),
  });
  messages.push(relMsg);

  for (let i = 0; i < GAME_PARTS.length; i += 1) {
    const embedIdx = GAME_MSG_START_IDX + i;
    const groupId = GAME_PARTS[i].group;
    const gamesMsg = await sendMsg(embedIdx, { embeds: [embeds[embedIdx]] });
    await addReactionsToMessage(gamesMsg, GROUPS[groupId].entries, iconMap, client);
    messages.push(gamesMsg);
  }

  const config = loadRoleMenuConfig();
  const prev = config[String(guildId)] || {};
  const preservedMessageIds = [
    ...new Set([
      ...(prev.preservedMessageIds || []),
      ...preservedIds,
    ]),
  ];
  config[String(guildId)] = {
    channelId,
    messageId: messages[0]?.id,
    messageIds: messages.map((m) => m.id),
    preservedMessageIds,
    mappings,
    legacyMappings: prev.legacyMappings || buildLegacyPlatformMappings(guild),
    webhookId: sender?.id || prev.webhookId || null,
  };
  saveRoleMenuConfig(config);
  return { messages, mappings, iconMap };
}

/** Fix role IDs, embeds, reactions — no full emoji re-upload. */
async function repairRoleMenu(client, guildId = DEFAULT_GUILD) {
  const cfg = getGuildRoleMenuConfig(guildId);
  if (!cfg?.channelId) throw new Error('No role menu config. Run j!setuprolemenu first.');

  console.log('[ROLE-MENU] Repair step 1/4: link roles…');
  const guild = await client.guilds.fetch(guildId);
  await guild.roles.fetch();
  const channel = await guild.channels.fetch(cfg.channelId);

  const sanitized = sanitizeMappingsMap(cfg.mappings || {}, { stripGameEmojis: false });
  const disk = loadRoleMenuConfig();
  disk[String(guildId)] = { ...cfg, mappings: sanitized };
  saveRoleMenuConfig(disk);

  let mappings = await ensureRoles(guild, true, { syncAppearance: false });
  console.log('[ROLE-MENU] Repair step 2/4: small-caps names + colors…');
  await syncAllRoleAppearances(guild, mappings);

  await client.application.fetch();
  await client.application.emojis.fetch().catch(() => {});

  await client.application.emojis.fetch().catch(() => {});
  const preferIds = Object.fromEntries(
    Object.entries(mappings)
      .filter(([k]) => k.startsWith('g_'))
      .map(([k, m]) => [k, m?.emojiId])
      .filter(([, id]) => id),
  );
  const needsIcon = allEntries().filter((e) => {
    if (!e.key.startsWith('g_')) return false;
    const id = mappings[e.key]?.emojiId;
    if (id && client.application.emojis.cache.has(id)) return false;
    return !findExistingAppEmoji(client, e, id);
  });
  let iconMap = iconMapFromStoredMappings(mappings);
  if (needsIcon.length) {
    console.log(`[ROLE-MENU] Uploading ${needsIcon.length} missing game icon(s) only (no duplicates)…`);
    const partial = await ensureGuildEmojisForEntries(guild, needsIcon, {
      upload: true,
      replace: false,
      preferIds,
    });
    iconMap = { ...iconMap, ...partial };
    mappings = applyIconMapToMappings(mappings, iconMap);
  } else {
    mappings = applyIconMapToMappings(mappings, iconMap);
  }

  // Load webhook sender if one was used during setup.
  const repairSender = cfg.webhookId
    ? (await channel.fetchWebhooks().catch(() => null))?.get(cfg.webhookId) || null
    : null;

  const embeds = buildAllEmbeds(guild.name, iconMap, buildEmbedOptions(guild, iconMap, repairSender));
  const prevIds = [...(cfg.messageIds || [])];
  let ids = await normalizeRoleMenuMessageIds(channel, prevIds);

  console.log('[ROLE-MENU] Generating banner GIFs…');
  const repairBanners = await generateSectionBanners(guild);

  for (const oldId of prevIds) {
    if (ids.includes(oldId)) continue;
    if (await isBumperMenuMessage(channel, oldId)) {
      const oldMsg = await channel.messages.fetch(oldId).catch(() => null);
      if (oldMsg?.author?.id === client.user.id) {
        await oldMsg.delete().catch(() => {});
        console.log('[ROLE-MENU] Removed old Bumper menu message');
      }
    }
  }

  const editOrSend = async (label, idx, embed, entries, { components = null, syncReactions = false } = {}) => {
    console.log(`[ROLE-MENU]   ${label}…`);
    let msg = ids[idx] ? await channel.messages.fetch(ids[idx]).catch(() => null) : null;
    const files = repairBanners[idx] ? [bannerFile(repairBanners[idx])] : [];
    const payload = {
      content: null,
      embeds: [embed],
      components: components ?? [],
      files,
    };
    if (msg) {
      const isOwnWebhook = repairSender && msg.webhookId && String(msg.webhookId) === String(repairSender.id);
      if (isOwnWebhook) {
        await repairSender.editMessage(msg.id, payload);
      } else if (msg.author?.id === client.user.id) {
        await msg.edit(payload);
      } else {
        msg = null; // not ours — fall through to send
      }
    }
    if (!msg) {
      if (repairSender) {
        const wMsg = await repairSender.send(payload);
        msg = await channel.messages.fetch(wMsg.id).catch(() => wMsg);
      } else {
        msg = await channel.send(payload);
      }
      ids[idx] = msg.id;
    }
    if (syncReactions && entries?.length) {
      const added = await ensureReactionsOnMessage(msg, entries, iconMap, client, { delayMs: 500 });
      console.log(`[ROLE-MENU]   ${label} — ${added} new reactions (${entries.length} total)`);
    } else {
      console.log(`[ROLE-MENU]   ${label} — done`);
    }
    return msg;
  };

  console.log('[ROLE-MENU] Repair step 3/4: refresh embeds (fast, no reaction wipe)…');
  await editOrSend('Intro', 0, embeds[0], null);
  await editOrSend('Age buttons', 1, embeds[1], null, {
    components: buildAgeButtonComponents(),
  });
  await editOrSend('Relationship buttons', 2, embeds[2], null, {
    components: buildRelationshipButtonComponents(),
  });
  for (let i = 0; i < GAME_PARTS.length; i += 1) {
    const idx = GAME_MSG_START_IDX + i;
    await editOrSend(`Games ${i + 1}/3 embed`, idx, embeds[idx], null);
  }
  console.log('[ROLE-MENU] Repair step 3b/4: replace ALL game reactions (full reset)…');
  for (let i = 0; i < GAME_PARTS.length; i += 1) {
    const idx = GAME_MSG_START_IDX + i;
    const groupId = GAME_PARTS[i].group;
    const msg = await channel.messages.fetch(ids[idx], { force: true }).catch(() => null);
    if (!msg) {
      console.warn(`[ROLE-MENU] Missing games message index ${idx}`);
      continue;
    }
    await replaceReactionsOnMessage(msg, GROUPS[groupId].entries, iconMap, client, { delayMs: 700 });
  }
  console.log('[ROLE-MENU] Repair step 4/4: sync emoji reactions…');
  mappings = applyIconMapToMappings(mappings, iconMap);

  const config = loadRoleMenuConfig();
  config[String(guildId)] = {
    ...cfg,
    messageIds: ids.filter(Boolean),
    messageId: ids[0],
    mappings,
  };
  saveRoleMenuConfig(config);
  console.log('[ROLE-MENU] Repair done — roles mapped:', Object.keys(mappings).length);
  return { mappings, iconMap, messageIds: ids };
}

/** Re-upload icons + edit existing bot role-menu messages (no deletes). */
async function refreshRoleMenuEmbeds(client, guildId) {
  const cfg = getGuildRoleMenuConfig(guildId);
  if (!cfg?.messageIds?.length) {
    throw new Error('No role menu messages in config. Run setup first.');
  }
  console.log('[ROLE-MENU] Refresh start…');
  const guild = await client.guilds.fetch(guildId);
  console.log('[ROLE-MENU] Guild OK');
  await guild.roles.fetch();
  const channel = await guild.channels.fetch(cfg.channelId);
  console.log('[ROLE-MENU] Channel OK — sync icons (dedupe orphans, upload only if missing)…');
  await client.application.emojis.fetch().catch(() => {});
  const preferIds = Object.fromEntries(
    Object.entries(cfg.mappings || {})
      .filter(([k]) => k.startsWith('g_'))
      .map(([k, m]) => [k, m?.emojiId])
      .filter(([, id]) => id),
  );
  const iconMap = await ensureGuildEmojisForEntries(guild, allEntries(), {
    upload: true,
    replace: false,
    preferIds,
  });
  const refreshSender = cfg.webhookId
    ? (await channel.fetchWebhooks().catch(() => null))?.get(cfg.webhookId) || null
    : null;

  console.log('[ROLE-MENU] Icons done — generating banners + editing messages…');
  let mappings = await ensureRoles(guild, false);
  mappings = applyIconMapToMappings(mappings, iconMap);
  const embeds = buildAllEmbeds(guild.name, iconMap, buildEmbedOptions(guild, iconMap, refreshSender));

  const refreshBanners = await generateSectionBanners(guild);

  let ids = await normalizeRoleMenuMessageIds(channel, cfg.messageIds || []);
  const edits = [
    { idx: 0, embeds: [embeds[0]], entries: null, components: [] },
    { idx: 1, embeds: [embeds[1]], entries: null, components: buildAgeButtonComponents() },
    { idx: 2, embeds: [embeds[2]], entries: null, components: buildRelationshipButtonComponents() },
  ];
  for (let i = 0; i < GAME_PARTS.length; i += 1) {
    const embedIdx = GAME_MSG_START_IDX + i;
    edits.push({
      idx: embedIdx,
      embeds: [embeds[embedIdx]],
      entries: GROUPS[GAME_PARTS[i].group].entries,
      components: [],
    });
  }
  for (const item of edits) {
    let msg = ids[item.idx] ? await channel.messages.fetch(ids[item.idx]).catch(() => null) : null;
    const files = refreshBanners[item.idx] ? [bannerFile(refreshBanners[item.idx])] : [];
    const payload = { content: null, embeds: item.embeds, components: item.components, files };
    if (msg) {
      const isOwnWebhook = refreshSender && msg.webhookId && String(msg.webhookId) === String(refreshSender.id);
      if (isOwnWebhook) {
        await refreshSender.editMessage(msg.id, payload);
      } else if (msg.author?.id === client.user.id) {
        await msg.edit(payload);
      } else {
        msg = null;
      }
    }
    if (!msg) {
      if (refreshSender) {
        const wMsg = await refreshSender.send(payload);
        msg = await channel.messages.fetch(wMsg.id).catch(() => wMsg);
      } else {
        msg = await channel.send(payload);
      }
      ids[item.idx] = msg.id;
    }
    if (item.entries?.length && msg) {
      await replaceReactionsOnMessage(msg, item.entries, iconMap, client, { delayMs: 700 });
    }
  }

  mappings = applyIconMapToMappings(mappings, iconMap);

  const config = loadRoleMenuConfig();
  config[String(guildId)] = {
    ...cfg,
    mappings,
    iconMapKeys: Object.keys(iconMap),
    messageIds: ids.filter(Boolean),
    messageId: ids[0],
  };
  saveRoleMenuConfig(config);
  return { mappings, iconMap };
}

async function fetchReactionContext(reaction, user) {
  if (user.bot) return null;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return null;
    }
  }
  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch {
      return null;
    }
  }
  const guild = reaction.message.guild;
  if (!guild) return null;

  const cfg = getGuildRoleMenuConfig(guild.id);
  if (!cfg || !isRoleMenuMessage(cfg, reaction.message.id)) return null;

  const ageMsgId = cfg.messageIds?.[1];
  const relMsgId = cfg.messageIds?.[2];
  if ((ageMsgId && String(reaction.message.id) === String(ageMsgId)) ||
      (relMsgId && String(reaction.message.id) === String(relMsgId))) return null;

  const entry = resolveEntryFromReaction(cfg, reaction, reaction.message.id);
  if (!entry?.roleId) return null;

  return { guild, cfg, entry, message: reaction.message };
}

async function removeOtherGroupRoles(member, cfg, groupId, exceptRoleId) {
  const keys = getKeysInGroup(cfg, groupId);
  for (const key of keys) {
    const roleId = cfg.mappings[key]?.roleId;
    if (!roleId || roleId === exceptRoleId) continue;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Role menu: single-select swap').catch(() => {});
    }
  }
}

async function applyRoleMenuEntry(member, cfg, entry, { toggle = false, removeOnly = false } = {}) {
  const groupType = getGroupType(cfg, entry.group);
  const hasRole = member.roles.cache.has(entry.roleId);

  if ((toggle || removeOnly) && hasRole) {
    await member.roles.remove(entry.roleId, 'Role menu: removed');
    console.log(`[ROLE-MENU] Removed ${entry.roleId} from ${member.user.tag}`);
    return 'removed';
  }

  if (removeOnly) return 'unchanged';

  if (groupType === 'single') {
    await removeOtherGroupRoles(member, cfg, entry.group, entry.roleId);
  }

  if (!member.roles.cache.has(entry.roleId)) {
    await member.roles.add(entry.roleId, 'Role menu: assigned');
    console.log(`[ROLE-MENU] Gave ${entry.roleId} to ${member.user.tag}`);
    return 'added';
  }
  return 'unchanged';
}

async function canBotAssignRole(guild, roleId) {
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: 'Bot needs **Manage Roles** permission.' };
  }
  if (!role) return { ok: false, reason: 'That role no longer exists — run `j!fixrolemenu`.' };
  if (me.roles.highest.position <= role.position) {
    return {
      ok: false,
      reason: 'Drag **JanJan** role **above** the game/age roles in Server Settings → Roles.',
    };
  }
  return { ok: true };
}

async function handleRoleMenuButton(interaction) {
  if (!interaction.isButton() || interaction.user.bot) return;

  const key = parseButtonCustomId(interaction.customId);
  if (!key) return;

  const guild = interaction.guild;
  if (!guild) return;

  const cfg = getGuildRoleMenuConfig(guild.id);
  if (!cfg) return;

  if (String(interaction.channelId) !== String(cfg.channelId)) return;

  const ageMsgId = cfg.messageIds?.[1];
  const relMsgId = cfg.messageIds?.[2];
  const isButtonMsg =
    (ageMsgId && String(interaction.message.id) === String(ageMsgId)) ||
    (relMsgId && String(interaction.message.id) === String(relMsgId));
  if (!isButtonMsg) return;

  try {
    await interaction.deferUpdate();

    const meta = cfg.mappings[key];
    if (!meta?.roleId) {
      await interaction.followUp({
        content: 'That role is not set up yet. Ask staff to run `j!fixrolemenu`.',
        ephemeral: true,
      });
      return;
    }

    const check = await canBotAssignRole(guild, meta.roleId);
    if (!check.ok) {
      await interaction.followUp({ content: check.reason, ephemeral: true });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id);
    const entry = { key, ...meta, group: meta.group || findGroupForKey(key) };
    const result = await applyRoleMenuEntry(member, cfg, entry, { toggle: true });
    console.log(`[ROLE-MENU] Button ${key} → ${result} for ${member.user.tag}`);

    const label = GROUPS.age.entries.find((e) => e.key === key)?.label
      || GROUPS.relationship.entries.find((e) => e.key === key)?.label
      || key;
    const feedback =
      result === 'removed'
        ? `**${label}** role removed. Tap the button again to add it back.`
        : result === 'added'
          ? `**${label}** role added. Tap the same button again to remove it.`
          : `**${label}** — no change.`;
    await interaction.followUp({ content: feedback, ephemeral: true }).catch(() => {});

    const { enforceVerifiedEligibility } = require('../verify/verifyEligibility');
    await enforceVerifiedEligibility(member, guild.id, { client: guild.client });
  } catch (err) {
    console.error('[ROLE-MENU] button error:', err);
    const msg =
      err.code === 50013
        ? 'Missing permission to change that role. Move JanJan higher in the role list.'
        : `Could not update role: ${err.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
}

async function handleRoleMenuReactionAdd(reaction, user) {
  if (user.bot) return;
  const ctx = await fetchReactionContext(reaction, user);
  if (!ctx) {
    if (reaction.message.guild && !user.bot) {
      const cfg = getGuildRoleMenuConfig(reaction.message.guild.id);
      if (cfg && isRoleMenuMessage(cfg, reaction.message.id)) {
        console.warn(
          '[ROLE-MENU] Unmatched reaction:',
          reaction.emoji?.name || reaction.emoji?.id,
          'on',
          reaction.message.id,
        );
      }
    }
    return;
  }

  const member = await ctx.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const { cfg, entry, message } = ctx;
  const check = await canBotAssignRole(ctx.guild, entry.roleId);
  if (!check.ok) {
    console.warn(`[ROLE-MENU] Cannot assign ${entry.key}:`, check.reason);
    return;
  }

  const groupType = getGroupType(cfg, entry.group);

  if (groupType === 'single') {
    await removeOtherGroupRoles(member, cfg, entry.group, entry.roleId);
    for (const key of getKeysInGroup(cfg, entry.group)) {
      const meta = cfg.mappings[key];
      if (!meta || meta.roleId === entry.roleId) continue;
      const r = findReaction(message, meta);
      if (!r) continue;
      const users = await r.users.fetch();
      if (users?.has(user.id)) {
        await r.users.remove(user.id).catch(() => {});
      }
    }
  }

  try {
    const groupType = getGroupType(cfg, entry.group);
    await applyRoleMenuEntry(member, cfg, entry, {
      toggle: groupType === 'multi',
      removeOnly: false,
    });
    const { enforceVerifiedEligibility } = require('../verify/verifyEligibility');
    await enforceVerifiedEligibility(member, ctx.guild.id, { client: ctx.guild.client });
  } catch (err) {
    console.error(`[ROLE-MENU] reaction add ${entry.key}:`, err.message);
  }
}

async function handleRoleMenuReactionRemove(reaction, user) {
  if (user.bot) return;
  const ctx = await fetchReactionContext(reaction, user);
  if (!ctx) return;

  const member = await ctx.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const { cfg, entry } = ctx;
  const check = await canBotAssignRole(ctx.guild, entry.roleId);
  if (!check.ok) return;

  try {
    await applyRoleMenuEntry(member, cfg, entry, { removeOnly: true });
    const { enforceVerifiedEligibility } = require('../verify/verifyEligibility');
    await enforceVerifiedEligibility(member, ctx.guild.id, { client: ctx.guild.client });
  } catch (err) {
    console.error(`[ROLE-MENU] reaction remove ${entry.key}:`, err.message);
  }
}

function registerRoleMenuHandlers(client) {
  if (client._roleMenuHandlersRegistered) return;
  client._roleMenuHandlersRegistered = true;

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleRoleMenuButton(interaction);
    } catch (err) {
      console.error('[ROLE-MENU] button:', err.message);
    }
  });

  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      await handleRoleMenuReactionAdd(reaction, user);
    } catch (err) {
      console.error('[ROLE-MENU] reaction add:', err.message);
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    try {
      await handleRoleMenuReactionRemove(reaction, user);
    } catch (err) {
      console.error('[ROLE-MENU] reaction remove:', err.message);
    }
  });

  console.log('[ROLE-MENU] Handlers registered (buttons + reactions)');
}

module.exports = {
  setupRoleMenu,
  repairRoleMenu,
  syncAllRoleAppearances,
  refreshRoleMenuEmbeds,
  registerRoleMenuHandlers,
  getGuildRoleMenuConfig,
  loadRoleMenuConfig,
  saveRoleMenuConfig,
  buildLegacyPlatformMappings,
  ensureRoles,
  syncRoleAppearance,
  replaceReactionsOnMessage,
  iconMapFromStoredMappings,
  sanitizeMappingsMap,
  GAME_MSG_START_IDX,
  DEFAULT_GUILD,
  DEFAULT_CHANNEL,
  DEFAULT_MESSAGE,
};
