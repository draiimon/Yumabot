const { toSmallCaps, labelKey } = require('../roleMenu/smallCaps');

/** Introduction template fields (order preserved for embed + parser). */
const INTRO_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'birthdate', label: 'Birthdate' },
  { key: 'height', label: 'Height' },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'comfortFood', label: 'Go-To Comfort Food' },
  { key: 'relationshipStatus', label: 'Relationship Status' },
  { key: 'funFact', label: 'A Fun Fact About Me' },
];

const FIELD_BY_LABEL_KEY = new Map(
  INTRO_FIELDS.map((f) => [labelKey(f.label), f.key]),
);

function capsLabel(field) {
  return toSmallCaps(field.label);
}

function getIntroTemplate() {
  return INTRO_FIELDS.map((f) => `**${capsLabel(f)}:** `).join('\n');
}

/** Parse intro posts — accepts normal English OR small-caps labels (incl. old broken f). */
function parseIntroText(text) {
  const data = {};
  const lines = String(text || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\*\*/g, '').trim();
    const colon = line.indexOf(':');
    if (colon < 1) continue;

    const labelPart = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!value) continue;

    const key = FIELD_BY_LABEL_KEY.get(labelKey(labelPart));
    if (key) data[key] = value.slice(0, 500);
  }

  return data;
}

function isIntroComplete(data) {
  return INTRO_FIELDS.every((f) => Boolean(data?.[f.key]?.trim()));
}

function missingIntroLabels(data) {
  return INTRO_FIELDS.filter((f) => !data?.[f.key]?.trim()).map((f) => f.label);
}

/** True when the message has no recognized intro field lines (random chat, wrong format). */
function isRandomIntroChat(text) {
  const parsed = parseIntroText(text);
  return Object.keys(parsed).length === 0;
}

function buildIntroFormatReminder() {
  const template = getIntroTemplate();
  return (
    '**This channel is for introductions only.** Random chat is **deleted** automatically.\n\n' +
    'Copy the template below, fill in **every** field, then send **one** message:\n\n' +
    template +
    '\n\n_See the guide embed above. Check progress with `j!view`._'
  );
}

module.exports = {
  INTRO_FIELDS,
  getIntroTemplate,
  capsLabel,
  parseIntroText,
  isIntroComplete,
  missingIntroLabels,
  isRandomIntroChat,
  buildIntroFormatReminder,
  toSmallCaps,
};
