/**
 * Restores the original-style platform role message (🖥️ 🎮 📱).
 * Does NOT delete any existing messages.
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

const require = createRequire(import.meta.url);
const {
  loadRoleMenuConfig,
  saveRoleMenuConfig,
  buildLegacyPlatformMappings,
  DEFAULT_GUILD,
  DEFAULT_CHANNEL,
} = require('../src/roleMenu/roleMenuSystem.js');

const ORIGINAL_MESSAGE_ID = '1426856978608816253';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  const guild = await client.guilds.fetch(DEFAULT_GUILD);
  await guild.roles.fetch();
  const channel = await guild.channels.fetch(DEFAULT_CHANNEL);

  const stillThere = await channel.messages.fetch(ORIGINAL_MESSAGE_ID).catch(() => null);
  if (stillThere) {
    console.log('Original message still exists — nothing to restore.');
    client.destroy();
    process.exit(0);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Platform Roles')
    .setDescription(
      'Select the platform(s) you play on. **React below** to assign or remove a role.\n\n' +
        '🖥️ **PC** · 🎮 **Console** · 📱 **Mobile**',
    )
    .addFields(
      { name: '🖥️ PC', value: 'Desktop / laptop gaming', inline: true },
      { name: '🎮 Console', value: 'PlayStation, Xbox, Switch, etc.', inline: true },
      { name: '📱 Mobile', value: 'Phone / tablet gaming', inline: true },
    )
    .setFooter({ text: 'React to toggle · Removing a reaction removes the role' });

  const msg = await channel.send({ embeds: [embed] });
  for (const emoji of ['🖥️', '🎮', '📱']) {
    await msg.react(emoji);
  }

  const config = loadRoleMenuConfig();
  const prev = config[DEFAULT_GUILD] || {};
  config[DEFAULT_GUILD] = {
    ...prev,
    preservedMessageIds: [
      ...new Set([...(prev.preservedMessageIds || []), ORIGINAL_MESSAGE_ID, msg.id]),
    ],
    legacyMappings: buildLegacyPlatformMappings(guild),
  };
  saveRoleMenuConfig(config);

  console.log('Restored platform menu at top. New message ID:', msg.id);
  console.log('(Original ID', ORIGINAL_MESSAGE_ID, 'was deleted earlier — this is a replacement.)');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
