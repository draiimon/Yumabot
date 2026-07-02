/**
 * One-off: grant Verified to every member who currently has Unverified
 * (or has neither role). Also touches each member's activity so the 5-day
 * inactivity timer starts fresh from now.
 *
 * Use case: reset the verify state of the server so everyone is verified,
 * then let the natural 5-day inactivity sweep demote members who don't engage.
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client, GatewayIntentBits } = require('discord.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUILD_ID = '1426746102903738431';
const VERIFIED_ROLE_ID = '1426746102903738432';
const UNVERIFIED_ROLE_ID = '1426806943896309822';
const ACTIVITY_PATH = path.join(__dirname, '..', 'data', 'member-activity.json');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
await client.login(process.env.DISCORD_TOKEN);
await new Promise((r) => client.once('clientReady', r));

const guild = await client.guilds.fetch(GUILD_ID);
const me = await guild.members.fetchMe();
await guild.members.fetch();

const verifiedRole = await guild.roles.fetch(VERIFIED_ROLE_ID);
const unverifiedRole = await guild.roles.fetch(UNVERIFIED_ROLE_ID);

if (!verifiedRole) {
  console.error('Verified role not found.');
  process.exit(1);
}

// Bot must be above both roles to manage them
if (verifiedRole.position >= me.roles.highest.position) {
  console.error(`Bot's highest role (pos ${me.roles.highest.position}) is not above Verified (pos ${verifiedRole.position}).`);
  process.exit(1);
}

// Load activity to refresh timestamps
function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return fallback; }
}
function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const activity = loadJson(ACTIVITY_PATH, {});
const nowIso = new Date().toISOString();

let granted = 0;
let skipped = 0;
let failed = 0;

for (const member of guild.members.cache.values()) {
  if (member.user.bot) continue;

  const hasVerified = member.roles.cache.has(VERIFIED_ROLE_ID);
  const hasUnverified = member.roles.cache.has(UNVERIFIED_ROLE_ID);

  // Skip if already verified AND doesn't have Unverified
  if (hasVerified && !hasUnverified) {
    skipped += 1;
    continue;
  }

  try {
    if (!hasVerified) {
      await member.roles.add(verifiedRole, 'Bulk grant: reset all members to Verified');
    }
    if (hasUnverified) {
      await member.roles.remove(unverifiedRole, 'Bulk grant: graduating from Unverified');
    }
    // Fresh activity timer so the next 5-day inactivity sweep gives them a full window
    activity[`${GUILD_ID}:${member.id}`] = {
      ...(activity[`${GUILD_ID}:${member.id}`] || {}),
      lastActiveAt: nowIso,
      warnedAt: null,
      revokedAt: null, // clear so verify-reminder doesn't classify them as 'reverify'
    };
    granted += 1;
    if (granted % 10 === 0) console.log(`  ${granted} granted so far...`);
  } catch (err) {
    console.warn(`  ✗ ${member.user.tag}: ${err.message}`);
    failed += 1;
  }
}

saveJson(ACTIVITY_PATH, activity);
console.log(`\nDone. Granted: ${granted}  Skipped: ${skipped}  Failed: ${failed}`);
console.log(`Activity refreshed for ${granted} member(s) — fresh 5-day window starting now.`);

client.destroy();
process.exit(0);
