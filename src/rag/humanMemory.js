/**
 * HUMAN MEMORY — per-kausap chismis database (Postgres).
 * HINDI OSA FAQ. HINDI policy knowledge base. TAO-to-TAO memory lang.
 */

const { JANJAN_HUMAN_REPLY_RULES } = require('./janjanVibes');
const {
  needsFullMemoryContext,
  messageMentionsOtherPeople,
} = require('./conversationMode');

const HUMAN_RECENT_MSG_LIMIT = Math.max(4, Number(process.env.HUMAN_MEMORY_MSG_LIMIT || 14));
const HUMAN_LIGHT_MSG_LIMIT = 4;
const HUMAN_CHANNEL_SUMMARY = String(process.env.HUMAN_MEMORY_CHANNEL_SUMMARY || 'true').toLowerCase() !== 'false';

function clip(text, max = 220) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

async function fetchUserFacts(pool, userId) {
  if (!userId) return '';
  try {
    const res = await pool.query('SELECT facts FROM user_memory WHERE user_id = $1', [String(userId)]);
    return String(res.rows?.[0]?.facts || '').trim();
  } catch {
    return '';
  }
}

async function fetchUserStyle(pool, userId) {
  if (!userId) return null;
  try {
    const res = await pool.query(
      'SELECT language, tone, slang_avg, samples FROM user_style_memory WHERE user_id = $1',
      [String(userId)],
    );
    if (!res.rows?.length) return null;
    const row = res.rows[0];
    let samples = [];
    if (Array.isArray(row.samples)) samples = row.samples;
    else if (typeof row.samples === 'string') {
      try {
        samples = JSON.parse(row.samples);
      } catch {
        samples = [];
      }
    }
    return {
      language: String(row.language || 'taglish').trim(),
      tone: String(row.tone || 'neutral').trim(),
      slangAvg: Number(row.slang_avg || 4),
      samples: Array.isArray(samples) ? samples.slice(-8) : [],
    };
  } catch {
    return null;
  }
}

async function fetchChannelSummary(pool, channelId) {
  if (!channelId || !HUMAN_CHANNEL_SUMMARY) return '';
  try {
    const res = await pool.query('SELECT summary FROM channel_memory WHERE channel_id = $1', [
      String(channelId),
    ]);
    return String(res.rows?.[0]?.summary || '').trim();
  } catch {
    return '';
  }
}

async function fetchRecentDialogue(pool, { channelId, userId, botUserId, limit = HUMAN_RECENT_MSG_LIMIT }) {
  if (!channelId || !userId) return { withUser: [], channelWide: [] };
  try {
    const userRes = await pool.query(
      `SELECT author_id, author_tag, content, created_at
       FROM messages
       WHERE channel_id = $1 AND author_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [String(channelId), String(userId), limit],
    );
    const wideRes = await pool.query(
      `SELECT author_id, author_tag, content, created_at
       FROM messages
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT $4`,
      [String(channelId), Math.min(limit + 8, 24)],
    );

    const mapRow = (row) => ({
      tag: String(row.author_tag || 'user').trim(),
      content: clip(row.content, 300),
      at: row.created_at ? new Date(row.created_at).toISOString() : '',
      isBot: String(row.author_id) === String(botUserId),
    });

    return {
      withUser: (userRes.rows || []).reverse().map(mapRow),
      channelWide: (wideRes.rows || []).reverse().map(mapRow),
    };
  } catch {
    return { withUser: [], channelWide: [] };
  }
}

const ONE_ON_ONE_RULES = `
[ONE-ON-ONE REPLY — DEFAULT]
- Sagutin LANG ang KAUSAP mo ngayon at ang SINABI NIYA sa message na ito.
- HUWAG mag-volunteer ng lumang chika ("kanina", "nakita ko sa usapan", Valo/sua/yanna) maliban kung TINANONG o may @ mention na relevant.
- Group chat ≠ ibig sabihin i-recap mo lahat ng nangyari sa channel. Natural DM energy sa isang tao.
- Isang banat, diretso, human — hindi script na paulit-ulit.
`.trim();

/**
 * Light memory — default casual chat (no spam past callbacks).
 */
async function buildLightMemoryContext(pool, {
  userId,
  channelId,
  botUserId,
  displayName = 'teh',
  currentMessage = '',
}) {
  if (!userId || !pool) {
    return { context: '', hasMemory: false, displayName, mode: 'light' };
  }

  const [style, dialogue] = await Promise.all([
    fetchUserStyle(pool, userId),
    fetchRecentDialogue(pool, {
      channelId,
      userId,
      botUserId,
      limit: HUMAN_LIGHT_MSG_LIMIT,
    }),
  ]);

  const lines = [];
  lines.push(`[KAUSAP NGAYON]: ${displayName}`);
  lines.push(ONE_ON_ONE_RULES);

  if (style) {
    lines.push(`\nMirror tone: ${style.tone}, ${style.language}, slang ~${style.slangAvg}/10`);
  }

  const recent = dialogue.withUser.slice(-3);
  if (recent.length) {
    lines.push('\nLast few lines ninyo (context lang — huwag i-recap kung hindi tinanong):');
    for (const m of recent) {
      const who = m.isBot ? 'ikaw' : displayName;
      lines.push(`  ${who}: ${m.content}`);
    }
  }

  if (currentMessage) {
    lines.push(`\n[SAGUTIN MO ITO]: "${clip(currentMessage, 400)}"`);
  }

  return {
    context: lines.join('\n'),
    hasMemory: recent.length > 0 || Boolean(style),
    displayName,
    mode: 'light',
  };
}

/**
 * Full chismis bank — only when user asks recall / kilala mo ba / etc.
 */
async function buildHumanMemoryContext(pool, {
  userId,
  channelId,
  botUserId,
  displayName = 'teh',
  currentMessage = '',
  forceFull = false,
}) {
  if (!userId || !pool) {
    return { context: '', hasMemory: false, displayName, mode: 'none' };
  }

  const full =
    forceFull ||
    needsFullMemoryContext(currentMessage) ||
    messageMentionsOtherPeople(currentMessage, displayName);

  if (!full) {
    return buildLightMemoryContext(pool, {
      userId,
      channelId,
      botUserId,
      displayName,
      currentMessage,
    });
  }

  const [facts, style, channelSummary, dialogue] = await Promise.all([
    fetchUserFacts(pool, userId),
    fetchUserStyle(pool, userId),
    fetchChannelSummary(pool, channelId),
    fetchRecentDialogue(pool, { channelId, userId, botUserId }),
  ]);

  const lines = [];
  lines.push(`[FULL MEMORY MODE] Kausap: ${displayName}`);
  lines.push(ONE_ON_ONE_RULES);

  if (facts) {
    lines.push('\n▸ Facts tungkol sa kanya:');
    lines.push(clip(facts, 800));
  }

  if (style) {
    lines.push(`\n▸ Style: ${style.language} | ${style.tone} | slang ${style.slangAvg}/10`);
  }

  if (channelSummary && messageMentionsOtherPeople(currentMessage, displayName)) {
    lines.push('\n▸ Channel tea (gamitin lang kung relevant sa tanong):');
    lines.push(clip(channelSummary, 600));
  }

  if (dialogue.withUser.length) {
    lines.push('\n▸ Usapan ninyo:');
    for (const m of dialogue.withUser.slice(-8)) {
      const who = m.isBot ? 'ikaw' : displayName;
      lines.push(`  ${who}: ${m.content}`);
    }
  }

  if (currentMessage) {
    lines.push(`\n[SAGUTIN MO ITO]: "${clip(currentMessage, 450)}"`);
  }

  lines.push('');
  lines.push(JANJAN_HUMAN_REPLY_RULES);

  const hasMemory = Boolean(
    facts || style || channelSummary || dialogue.withUser.length,
  );

  return {
    context: lines.join('\n'),
    hasMemory,
    displayName,
    facts,
    style,
    mode: 'full',
  };
}

function shouldUseBotHelpLookup(message = '') {
  const lower = String(message || '').toLowerCase();
  return /\b(j!|command|commands|paano gamitin|ano ang j!|bot command|lavalink setup|render deploy|groq key|j!help|j!vc|j!play)\b/i.test(
    lower,
  );
}

module.exports = {
  buildHumanMemoryContext,
  buildLightMemoryContext,
  shouldUseBotHelpLookup,
  fetchUserFacts,
  fetchUserStyle,
};
