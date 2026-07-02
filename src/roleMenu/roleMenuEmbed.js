const { EmbedBuilder } = require('discord.js');
const { GROUPS } = require('./definitions');

const COLOR = 0x5865f2;
const COLOR_GAMES = 0x57f287;

function displayFor(entry, iconMap) {
  return iconMap?.[entry.key]?.display || entry.emoji;
}

function reactFor(entry, iconMap) {
  if (entry.key.startsWith('age_') || entry.key.startsWith('rel_')) {
    return entry.emoji;
  }
  return iconMap?.[entry.key]?.react || entry.emoji;
}

/** Game/platform fields — icon + label. */
function fieldsFromEntries(entries, iconMap) {
  const fields = entries.map((e) => {
    const icon = displayFor(e, iconMap);
    return {
      name: `${icon} ${e.label}`,
      value: '​',
      inline: true,
    };
  });
  if (fields.length % 3 === 2) {
    fields.push({ name: '​', value: '​', inline: true });
  }
  return fields;
}

const BANNER_ATTACHMENT = 'attachment://role-banner.gif';

function buildIntroEmbed(guildName, thumbnailUrl, withBanner) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Community Role Selection')
    .setDescription(
      `Welcome to **${guildName}**.\n\n` +
        '**Age** — buttons on the next message (tap again to **remove**).\n' +
        '**Relationship** — buttons on the message after that.\n' +
        '**Games & platforms** — react on **Games 1/3, 2/3, 3/3** (**at least one required** to verify).',
    )
    .setFooter({ text: 'Role Menu' })
    .setTimestamp();
  if (withBanner) embed.setImage(BANNER_ATTACHMENT);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

function buildAgeEmbed(thumbnailUrl, withBanner) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Age')
    .setDescription(
      'Choose your **age range** using the buttons below.\n\n' +
        'Tap a button to **add** the role — tap again to **remove** it.',
    )
    .setFooter({ text: 'Single-select — one at a time' });
  if (withBanner) embed.setImage(BANNER_ATTACHMENT);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

function buildRelationshipEmbed(thumbnailUrl, withBanner) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Relationship')
    .setDescription(
      'Optional — choose your **relationship status** using the buttons below.\n\n' +
        'Tap a button to **add** the role — tap again to **remove** it.',
    )
    .setFooter({ text: 'Single-select — one at a time' });
  if (withBanner) embed.setImage(BANNER_ATTACHMENT);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

/** @deprecated kept for any leftover callers */
function buildIdentityEmbed(thumbnailUrl, withBanner) {
  return buildAgeEmbed(thumbnailUrl, withBanner);
}

function buildGamesEmbed(part, total, title, entries, iconMap, thumbnailUrl, withBanner) {
  const embed = new EmbedBuilder()
    .setColor(COLOR_GAMES)
    .setTitle(title)
    .setDescription(
      `**Part ${part}/${total}** — react with a game icon below. You may select multiple games.`,
    )
    .addFields(fieldsFromEntries(entries, iconMap))
    .setFooter({ text: 'Remove reaction to remove role' });
  if (withBanner) embed.setImage(BANNER_ATTACHMENT);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

const GAME_PARTS = [
  { part: 1, title: 'Games (1/3)', group: 'games_a' },
  { part: 2, title: 'Games (2/3)', group: 'games_b' },
  { part: 3, title: 'Games (3/3)', group: 'games_c' },
];

/**
 * Returns 6 embeds: intro, age, relationship, games 1/3, 2/3, 3/3.
 */
function buildAllEmbeds(guildName, iconMap = {}, { thumbnailUrl, withBanner = false } = {}) {
  return [
    buildIntroEmbed(guildName, thumbnailUrl, withBanner),
    buildAgeEmbed(thumbnailUrl, withBanner),
    buildRelationshipEmbed(thumbnailUrl, withBanner),
    ...GAME_PARTS.map(({ part, title, group }) =>
      buildGamesEmbed(part, GAME_PARTS.length, title, GROUPS[group].entries, iconMap, thumbnailUrl, withBanner),
    ),
  ];
}

module.exports = {
  buildAllEmbeds,
  buildIntroEmbed,
  buildAgeEmbed,
  buildRelationshipEmbed,
  buildIdentityEmbed,
  buildGamesEmbed,
  GAME_PARTS,
  displayFor,
  reactFor,
  fieldsFromEntries,
};
