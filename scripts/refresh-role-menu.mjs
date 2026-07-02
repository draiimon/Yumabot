/**
 * Refresh role-menu embeds + reactions (reuses existing rm_* icons; dedupes orphans).
 * Does NOT delete channel messages. Avoid running while another upload script is active.
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const require = createRequire(import.meta.url);
const { refreshRoleMenuEmbeds, DEFAULT_GUILD } = require('../src/roleMenu/roleMenuSystem.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.once('ready', async () => {
  process.env.SKIP_EMOJI_GG_WARMUP = '1';
  console.log('Syncing role menu icons (dedupe + missing only)…');
  const result = await refreshRoleMenuEmbeds(
    client,
    process.env.ROLE_MENU_GUILD_ID || DEFAULT_GUILD,
  );
  console.log('Done. Mapped roles:', Object.keys(result.mappings).length);
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
