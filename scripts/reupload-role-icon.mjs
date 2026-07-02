/**
 * Re-upload role-menu app emoji(s) and refresh embeds + reactions.
 * Usage: node scripts/reupload-role-icon.mjs g_roblox g_minecraft g_pokemon
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const require = createRequire(import.meta.url);
const { allEntries, GROUPS } = require('../src/roleMenu/definitions.js');
const {
  fetchIconBuffer,
  emojiNameForEntry,
  formatDiscordEmoji,
  shouldUploadCustomEmoji,
} = require('../src/roleMenu/guildEmojiIcons.js');
const { buildGamesEmbed, buildIdentityEmbed } = require('../src/roleMenu/roleMenuEmbed.js');
const { DEFAULT_GUILD } = require('../src/roleMenu/roleMenuSystem.js');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'role-menu-config.json');
const KEYS = process.argv.slice(2);
const DELAY_MS = Number(process.env.ROLE_MENU_UPLOAD_DELAY_MS) || 2000;

if (!KEYS.length) {
  console.error('Usage: node scripts/reupload-role-icon.mjs <key> [key2 ...]');
  process.exit(1);
}

const entries = KEYS.map((key) => {
  const entry = allEntries().find((e) => e.key === key);
  if (!entry) throw new Error(`Unknown key: ${key}`);
  return entry;
});

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function iconMapFromConfig(cfg) {
  const map = {};
  for (const [key, meta] of Object.entries(cfg.mappings || {})) {
    if (meta.emojiDisplay) {
      map[key] = {
        display: meta.emojiDisplay,
        react: meta.emojiId || meta.react || meta.emoji,
        id: meta.emojiId,
        name: meta.emoji,
      };
    }
  }
  return map;
}

function findMessageIndex(key) {
  if (GROUPS.games_a.entries.some((e) => e.key === key)) return 2;
  if (GROUPS.games_b.entries.some((e) => e.key === key)) return 3;
  if (GROUPS.games_c.entries.some((e) => e.key === key)) return 4;
  if (
    GROUPS.age.entries.some((e) => e.key === key) ||
    GROUPS.relationship.entries.some((e) => e.key === key)
  ) {
    return 1;
  }
  return null;
}

async function refreshMessage(channel, cfg, msgIdx, iconMap, client) {
  const msgId = cfg.messageIds[msgIdx];
  const msg = await channel.messages.fetch(msgId);
  let embed;
  if (msgIdx === 2) {
    embed = buildGamesEmbed(1, 3, 'Games (1/3)', GROUPS.games_a.entries, iconMap);
  } else if (msgIdx === 3) {
    embed = buildGamesEmbed(2, 3, 'Games (2/3)', GROUPS.games_b.entries, iconMap);
  } else if (msgIdx === 4) {
    embed = buildGamesEmbed(3, 3, 'Games (3/3)', GROUPS.games_c.entries, iconMap);
    } else if (msgIdx === 1) {
      embed = buildIdentityEmbed();
  } else {
    return;
  }
  await msg.edit({ embeds: [embed] });
  return msg;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction],
});

client.once('ready', async () => {
  try {
    const guildId = process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD;
    const config = loadConfig();
    const cfg = config[String(guildId)];
    if (!cfg?.messageIds?.length) throw new Error('No role menu in config');

    await client.application.fetch();
    await client.application.emojis.fetch();

    const oldEmojiIds = {};
    let iconMap = iconMapFromConfig(cfg);

    for (const entry of entries) {
      oldEmojiIds[entry.key] = cfg.mappings[entry.key]?.emojiId;
      const old = client.application.emojis.cache.find((e) => e.name === emojiNameForEntry(entry));
      if (old) {
        await old.delete(`Reupload ${entry.key}`);
        console.log(`Deleted ${old.name}`);
        await new Promise((r) => setTimeout(r, 800));
      }

      if (shouldUploadCustomEmoji(entry)) {
        console.log(`\n=== ${entry.label} (${entry.key}) ===`);
        const buf = await fetchIconBuffer(entry);
        await new Promise((r) => setTimeout(r, DELAY_MS));
        const emoji = await client.application.emojis.create({
          attachment: buf,
          name: emojiNameForEntry(entry),
        });
        console.log(`Uploaded ${emoji.toString()}`);
        iconMap[entry.key] = {
          id: emoji.id,
          name: emoji.name,
          display: formatDiscordEmoji(emoji),
          react: emoji.id,
        };
        cfg.mappings[entry.key] = {
          ...cfg.mappings[entry.key],
          emoji: iconMap[entry.key].name,
          emojiId: iconMap[entry.key].id,
          emojiDisplay: iconMap[entry.key].display,
          react: iconMap[entry.key].react,
        };
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    config[String(guildId)] = cfg;
    saveConfig(config);

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(cfg.channelId);
    const msgIndexes = new Set(entries.map((e) => findMessageIndex(e.key)));

    for (const msgIdx of msgIndexes) {
      const msg = await refreshMessage(channel, cfg, msgIdx, iconMap, client);
      if (!msg) continue;

      for (const entry of entries.filter((e) => findMessageIndex(e.key) === msgIdx)) {
        const oldId = oldEmojiIds[entry.key];
        if (oldId) {
          const oldReact = msg.reactions.cache.find((r) => r.emoji.id === oldId);
          if (oldReact) {
            const users = await oldReact.users.fetch();
            if (users.has(client.user.id)) await oldReact.users.remove(client.user.id).catch(() => {});
          }
        }
        const hasNew = msg.reactions.cache.some((r) => r.emoji.id === iconMap[entry.key].id);
        if (!hasNew) {
          await msg.react(iconMap[entry.key].react).catch((e) => console.warn('react:', e.message));
        }
      }
      console.log(`Updated message ${cfg.messageIds[msgIdx]}`);
    }

    console.log(`\nDone — ${entries.length} icon(s) re-uploaded.`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  client.destroy();
  process.exit(process.exitCode || 0);
});

client.login(process.env.DISCORD_TOKEN);
