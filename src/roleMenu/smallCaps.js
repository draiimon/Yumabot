/**
 * Small-caps letters only (user-specified). Digits 0-9 stay normal ASCII.
 * ᴀ ʙ ᴄ ᴅ ᴇ ғ ɢ ʜ ɪ ᴊ ᴋ ʟ ᴍ ɴ ᴏ ᴘ ǫ ʀ s ᴛ ᴜ ᴠ ᴡ x ʏ ᴢ
 */
const MAP = {
  a: 'ᴀ',
  b: 'ʙ',
  c: 'ᴄ',
  d: 'ᴅ',
  e: 'ᴇ',
  f: 'ғ',
  g: 'ɢ',
  h: 'ʜ',
  i: 'ɪ',
  j: 'ᴊ',
  k: 'ᴋ',
  l: 'ʟ',
  m: 'ᴍ',
  n: 'ɴ',
  o: 'ᴏ',
  p: 'ᴘ',
  q: 'ǫ',
  r: 'ʀ',
  s: 's',
  t: 'ᴛ',
  u: 'ᴜ',
  v: 'ᴠ',
  w: 'ᴡ',
  x: 'x',
  y: 'ʏ',
  z: 'ᴢ',
};

/** Old bug mapped "f" to Cyrillic ӓ — decode pasted intros that used it. */
const LEGACY_WRONG_F = '\u04d3';

const REVERSE = (() => {
  const rev = { [LEGACY_WRONG_F]: 'f' };
  for (const [ascii, cap] of Object.entries(MAP)) {
    rev[cap] = ascii;
  }
  return rev;
})();

function toSmallCaps(text) {
  return String(text)
    .split('')
    .map((ch) => {
      const lower = ch.toLowerCase();
      if (lower >= 'a' && lower <= 'z' && MAP[lower]) return MAP[lower];
      return ch;
    })
    .join('');
}

function fromSmallCaps(text) {
  return String(text)
    .split('')
    .map((ch) => REVERSE[ch] ?? ch)
    .join('');
}

function labelKey(text) {
  return fromSmallCaps(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

module.exports = {
  toSmallCaps,
  fromSmallCaps,
  labelKey,
  MAP,
};
