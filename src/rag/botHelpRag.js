/**
 * Optional bot-command lookup only (j!help, setup) — NOT for chismis chat.
 * Wraps vector JSON chunks when user explicitly asks about commands.
 */
const { searchRag } = require('./ragService');
const { shouldUseBotHelpLookup } = require('./humanMemory');

async function searchBotHelp(message, options = {}) {
  if (!shouldUseBotHelpLookup(message)) {
    return { context: '', confidence: 0, tier: 'SKIP', chunks: [], method: 'skip' };
  }
  return searchRag(message, options);
}

module.exports = {
  searchBotHelp,
  shouldUseBotHelpLookup,
};
