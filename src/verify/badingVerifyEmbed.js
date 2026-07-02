const { EmbedBuilder } = require('discord.js');

const RULES_CHANNEL = '1426746103616897125';
const GET_ROLE_CHANNEL = '1426746103616897130';
const { getIntroChannelId } = require('../intro/introSystem');

function buildVerifyEmbed(guildName = 'this server', guildId = null) {
  const introChannelId = (guildId && getIntroChannelId(guildId)) || null;
  const introMention = introChannelId ? `<#${introChannelId}>` : '**#introduction**';

  return new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle('👾  VERIFICATION REQUIRED')
    .setDescription(
      `> Welcome to **${guildName}**!\n` +
      `> Complete all steps below to unlock the full server.\n\n` +

      `📖  **Step 1 — Server Rules**\n` +
      `Read <#${RULES_CHANNEL}> carefully.\n` +
      `By reacting, you agree to follow all rules.\n\n` +

      `🏷️  **Step 2 — Get Roles**\n` +
      `Head to <#${GET_ROLE_CHANNEL}>:\n` +
      `→ Pick your **Age** + **Relationship** *(buttons)*\n` +
      `→ Pick **at least one game or platform** *(reactions)*\n\n` +

      `📝  **Step 3 — Introduction**\n` +
      `Post your intro in ${introMention} using the template.\n` +
      `*(Name, Age, Birthdate, etc.) — Check progress: \`j!view\`*\n\n` +

      `👾  **Step 4 — Verify**\n` +
      `React **👾** below once **all steps are done**.\n` +
      `⚠️ Missing roles or no intro = request denied.\n` +
      `⚠️ Removing **👾** revokes your access.\n\n` +

      `*This channel is view-only — reactions only, no chat.*`,
    )
    .setFooter({
      text: `${guildName} · React 👾 to unlock the server`,
    })
    .setTimestamp();
}

/** @deprecated use buildVerifyEmbed */
function buildBadingVerifyEmbed(guildName) {
  return buildVerifyEmbed(guildName);
}

module.exports = { buildVerifyEmbed, buildBadingVerifyEmbed };
