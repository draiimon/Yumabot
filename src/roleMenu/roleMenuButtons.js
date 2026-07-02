const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GROUPS } = require('./definitions');

const BUTTON_PREFIX = 'rm:';

function buttonCustomId(entryKey) {
  return `${BUTTON_PREFIX}${entryKey}`;
}

function parseButtonCustomId(customId) {
  if (!customId?.startsWith(BUTTON_PREFIX)) return null;
  return customId.slice(BUTTON_PREFIX.length);
}

/** Discord buttons reject some ZWJ/compound emojis (e.g. ❤️‍🩹). */
function emojiForButton(entry) {
  if (entry.key === 'rel_complicated') return '💔';
  const e = entry.emoji || '';
  if (e.includes('\u200d')) return null;
  return e;
}

function entryToButton(entry) {
  const btn = new ButtonBuilder()
    .setCustomId(buttonCustomId(entry.key))
    .setLabel(entry.label.slice(0, 80))
    .setStyle(ButtonStyle.Primary);
  const emoji = emojiForButton(entry);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

function buildAgeButtonComponents() {
  const buttons = GROUPS.age.entries.map(entryToButton);
  return buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

function buildRelationshipButtonComponents() {
  const buttons = GROUPS.relationship.entries.map(entryToButton);
  return buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

/** @deprecated use buildAgeButtonComponents + buildRelationshipButtonComponents */
function buildIdentityButtonComponents() {
  return [...buildAgeButtonComponents(), ...buildRelationshipButtonComponents()];
}

module.exports = {
  buildAgeButtonComponents,
  buildRelationshipButtonComponents,
  buildIdentityButtonComponents,
  buttonCustomId,
  parseButtonCustomId,
  BUTTON_PREFIX,
};
