/**
 * When to load full chismis bank vs light one-on-one reply.
 */
function needsFullMemoryContext(message = '') {
  const lower = String(message || '').toLowerCase();
  return /\b(kilala\s+mo\s+ba|do\s+you\s+know\s+me|who\s+am\s+i|ano\s+(?:na\s+)?napag[\s-]*usapan|what\s+did\s+we\s+talk|remember|recall|naalala|backread|summary|recap|sino\s+si\s+|kilala\s+mo\s+si\s+|kanina\s+sinabi|sinabi\s+ko\s+na|issue\s+kanina|yung\s+ano|alam\s+mo\s+na\s+ba)\b/i.test(
    lower,
  );
}

function messageMentionsOtherPeople(message = '', authorDisplay = '') {
  const lower = String(message || '').toLowerCase();
  const author = String(authorDisplay || '').toLowerCase();
  const hasAt = /<@!?\d+>/.test(message);
  const nameCue = /\b(si\s+[a-z]{2,}|@)\b/i.test(message);
  if (hasAt || nameCue) return true;
  const others = ['sua', 'yanna', 'boj', 'josh', 'drei', 'anya', 'hans'];
  return others.some((n) => n !== author && lower.includes(n));
}

function isLowSignalMessage(message = '') {
  const t = String(message || '').trim();
  if (t.length < 3) return true;
  if (/^(ok|okay|oo|haha|lol|wdym|eme|charot|luh|hala|ingay|tanga|gago)[\s!.?]*$/i.test(t)) return true;
  return false;
}

module.exports = {
  needsFullMemoryContext,
  messageMentionsOtherPeople,
  isLowSignalMessage,
};
