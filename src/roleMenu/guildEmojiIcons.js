const axios = require('axios');
const { resolveGameIconUrl } = require('./iconSources');
const { warmUpEmojiGg } = require('./emojiGgPacks');
const { optimizeForDiscordEmoji } = require('./optimizeEmojiImage');
const { allGameEntries } = require('./definitions');

const EMOJI_PREFIX = 'rm_';
const UPLOAD_DELAY_MS = Number(process.env.ROLE_MENU_UPLOAD_DELAY_MS) || 2200;
const DELETE_DELAY_MS = Number(process.env.ROLE_MENU_DELETE_DELAY_MS) || 800;
const API_TIMEOUT_MS = 45000;

/** Game/platform roles → custom emoji (application upload). Age/rel → unicode. */
function shouldUploadCustomEmoji(entry) {
  return entry.key.startsWith('g_');
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function emojiNameForEntry(entry) {
  const base = (entry.key || entry.roleName || 'role').replace(/[^a-z0-9_]/gi, '_').slice(0, 28);
  return `${EMOJI_PREFIX}${base}`.slice(0, 32);
}

function formatDiscordEmoji(emoji) {
  if (!emoji?.id) return null;
  return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

function entryFallbackUnicode(entry) {
  return entry.emoji || '❔';
}

function isValidImageBuffer(buf) {
  if (!buf || buf.length < 50) return false;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isGif = buf[0] === 0x47 && buf[1] === 0x49;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf[8] === 0x57 && buf[9] === 0x45;
  const isIco = buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0;
  const isSvg = buf[0] === 0x3c && buf[1] === 0x73 && buf[2] === 0x76 && buf[3] === 0x67;
  return isPng || isGif || isJpeg || isWebp || isIco || isSvg;
}

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { 'User-Agent': 'JanJanBot/1.0 (emoji.gg packs)' },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (!isValidImageBuffer(buf)) throw new Error('invalid image bytes');
  return buf;
}

async function fetchIconBuffer(entry) {
  const src = resolveGameIconUrl(entry.key);
  if (src?.url) {
    const raw = await downloadBuffer(src.url);
    console.log(`[ROLE-MENU]   icon: ${src.source}`);
    return optimizeForDiscordEmoji(raw);
  }
  if (entry.emoji && [...entry.emoji].length <= 8) {
    const cp = [...entry.emoji].map((c) => c.codePointAt(0).toString(16)).join('-');
    const raw = await downloadBuffer(
      `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${cp}.png`,
    );
    console.log('[ROLE-MENU]   icon: twemoji (no store logo yet)');
    return optimizeForDiscordEmoji(raw);
  }
  throw new Error(`no icon for ${entry.key}`);
}

async function deleteOldAppEmojis(client) {
  await client.application.fetch();
  await client.application.emojis.fetch();
  const targets = [...client.application.emojis.cache.values()].filter((e) =>
    e.name.startsWith(EMOJI_PREFIX),
  );
  if (!targets.length) {
    console.log('[ROLE-MENU] No old rm_ application emojis to remove.');
    return 0;
  }
  console.log(`[ROLE-MENU] Removing ${targets.length} old app emojis…`);
  let n = 0;
  for (const e of targets) {
    n += 1;
    process.stdout.write(`[ROLE-MENU]   delete ${n}/${targets.length} :${e.name}: … `);
    try {
      await e.delete();
      console.log('ok');
    } catch (err) {
      console.log('skip', err.message);
    }
    await new Promise((r) => setTimeout(r, DELETE_DELAY_MS));
  }
  client.application.emojis.cache.clear();
  await client.application.emojis.fetch();
  return n;
}

function expectedRoleMenuEmojiNames(entries = allGameEntries()) {
  return new Set(entries.filter(shouldUploadCustomEmoji).map((e) => emojiNameForEntry(e)));
}

function findExistingAppEmoji(client, entry, preferId) {
  if (preferId) {
    const byId = client.application.emojis.cache.get(preferId);
    if (byId?.name === emojiNameForEntry(entry)) return byId;
  }
  const name = emojiNameForEntry(entry);
  return client.application.emojis.cache.find((e) => e.name === name) || null;
}

/**
 * Remove duplicate/orphan rm_* app emojis so uploads never stack extras.
 * - Same name twice → keep preferId or oldest id
 * - rm_* not in expected game names → delete (legacy rm_valorant, test icons, etc.)
 */
async function dedupeRoleMenuAppEmojis(client, { preferIds = {} } = {}) {
  await client.application.fetch();
  await client.application.emojis.fetch();
  const expected = expectedRoleMenuEmojiNames();
  const rm = [...client.application.emojis.cache.values()].filter((e) =>
    e.name?.startsWith(EMOJI_PREFIX),
  );

  const byName = new Map();
  for (const e of rm) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(e);
  }

  const preferIdSet = new Set(
    Object.values(preferIds).filter((id) => id && /^\d+$/.test(String(id))),
  );
  let removed = 0;

  const removeEmoji = async (e, reason) => {
    try {
      await e.delete(reason);
      removed += 1;
      client.application.emojis.cache.delete(e.id);
    } catch (err) {
      console.warn(`[ROLE-MENU] dedupe skip :${e.name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, DELETE_DELAY_MS));
  };

  for (const [name, list] of byName) {
    if (list.length > 1) {
      const preferred = list.find((e) => preferIdSet.has(e.id));
      const sorted = [...list].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      const keep = preferred || sorted[0];
      for (const e of list) {
        if (e.id === keep.id) continue;
        console.log(`[ROLE-MENU] dedupe duplicate name :${name}: drop ${e.id}, keep ${keep.id}`);
        await removeEmoji(e, 'dedupe: duplicate name');
      }
    }
  }

  await client.application.emojis.fetch();
  for (const e of [...client.application.emojis.cache.values()]) {
    if (!e.name?.startsWith(EMOJI_PREFIX)) continue;
    if (expected.has(e.name)) continue;
    console.log(`[ROLE-MENU] dedupe orphan :${e.name}: (${e.id})`);
    await removeEmoji(e, 'dedupe: orphan rm_*');
  }

  await client.application.emojis.fetch();
  const left = [...client.application.emojis.cache.values()].filter((e) =>
    e.name?.startsWith(EMOJI_PREFIX),
  );
  console.log(
    `[ROLE-MENU] dedupe done — removed ${removed}, ${left.length} rm_* left (expect ${expected.size})`,
  );
  return { removed, count: left.length, expected: expected.size };
}

/**
 * Upload icons to BOT application (emoji.gg packs). Works when guild emoji API hangs.
 */
async function ensureGuildEmojisForEntries(
  guild,
  entries,
  { upload = true, replace = false, preferIds = {} } = {},
) {
  const client = guild.client;
  console.log('[ROLE-MENU] Preparing upload (bot application emojis, official/icon sources)…');
  if (!process.env.SKIP_EMOJI_GG_WARMUP) await warmUpEmojiGg();
  await client.application.fetch();
  await client.application.emojis.fetch();
  console.log(`[ROLE-MENU] Bot app emojis: ${client.application.emojis.cache.size}`);

  if (replace) {
    await deleteOldAppEmojis(client);
    await client.application.emojis.fetch();
  } else {
    await dedupeRoleMenuAppEmojis(client, { preferIds });
    await client.application.emojis.fetch();
  }

  const iconMap = {};
  const total = entries.length;
  const gameEntries = entries.filter(shouldUploadCustomEmoji);
  console.log(
    `[ROLE-MENU] ${gameEntries.length} game icons to upload, ${total - gameEntries.length} use unicode. Delay ${UPLOAD_DELAY_MS}ms.\n`,
  );

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const n = i + 1;

    if (!shouldUploadCustomEmoji(entry)) {
      console.log(`[ROLE-MENU] [${n}/${total}] ${entry.label} → unicode ${entry.emoji}\n`);
      iconMap[entry.key] = { display: entry.emoji, react: entry.emoji, name: entry.emoji };
      continue;
    }

    const preferId = preferIds[entry.key];
    let emoji = replace ? null : findExistingAppEmoji(client, entry, preferId);

    if (!emoji && upload) {
      console.log(`[ROLE-MENU] [${n}/${total}] ${entry.label}`);
      try {
        const buffer = await withTimeout(fetchIconBuffer(entry), 20000, 'download');
        console.log(`[ROLE-MENU]   uploading ${buffer.length} bytes to Discord app…`);
        await new Promise((r) => setTimeout(r, UPLOAD_DELAY_MS));
        emoji = await withTimeout(
          client.application.emojis.create({
            attachment: buffer,
            name: emojiNameForEntry(entry),
          }),
          API_TIMEOUT_MS,
          'application emoji create',
        );
        await client.application.emojis.fetch(emoji.id).catch(() => {});
        console.log(`[ROLE-MENU]   ✅ ${emoji.toString()}\n`);
      } catch (err) {
        const exists =
          err.code === 50035 ||
          /already exists|duplicate|name.*taken/i.test(String(err.message || ''));
        if (exists) {
          await client.application.emojis.fetch();
          emoji = findExistingAppEmoji(client, entry, preferId);
          if (emoji) console.log(`[ROLE-MENU]   ♻️ reused existing ${emoji.toString()}\n`);
        }
        if (!emoji) {
          console.warn(`[ROLE-MENU]   ❌ ${err.message}\n`);
          if (String(err.message).includes('rate limit') || err.code === 429) {
            console.log('[ROLE-MENU] Rate limit — wait 10s…');
            await new Promise((r) => setTimeout(r, 10000));
          }
        }
      }
      await new Promise((r) => setTimeout(r, UPLOAD_DELAY_MS));
    } else if (emoji) {
      console.log(`[ROLE-MENU] [${n}/${total}] ♻️ ${emoji.toString()}\n`);
    }

    if (emoji) {
      iconMap[entry.key] = {
        id: emoji.id,
        name: emoji.name,
        animated: Boolean(emoji.animated),
        display: formatDiscordEmoji(emoji),
        react: emoji.id,
      };
    } else {
      iconMap[entry.key] = {
        display: entryFallbackUnicode(entry),
        react: entry.emoji,
        name: entry.emoji,
      };
    }
  }

  console.log('[ROLE-MENU] Upload pass done.');
  return iconMap;
}

function applyIconMapToMappings(mappings, iconMap) {
  const out = { ...mappings };
  for (const [key, meta] of Object.entries(out)) {
    const ic = iconMap[key];
    if (!ic) continue;
    out[key] = {
      ...meta,
      emoji: ic.name || meta.emoji,
      emojiId: ic.id || undefined,
      emojiDisplay: ic.display,
      react: ic.react,
    };
  }
  return out;
}

module.exports = {
  ensureGuildEmojisForEntries,
  applyIconMapToMappings,
  deleteOldAppEmojis,
  dedupeRoleMenuAppEmojis,
  expectedRoleMenuEmojiNames,
  findExistingAppEmoji,
  emojiNameForEntry,
  formatDiscordEmoji,
  fetchIconBuffer,
  shouldUploadCustomEmoji,
};
