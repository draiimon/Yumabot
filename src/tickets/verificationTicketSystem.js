const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { generateChannelBanner } = require('../welcome/welcomeCanvas');
const { getOrCreateGuildWebhook } = require('../utils/guildWebhook');
const {
  checkVerifyReadiness,
  formatVerifyBlockMessage,
} = require('../intro/introSystem');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'ticket-config.json');

const DEFAULT_GUILD = '1426746102903738431';
/** Spawn area — welcome channel (old spawnpoint ID was removed from server). */
const DEFAULT_SPAWNPOINT_CHANNEL = '1506585781811154944';
const DEFAULT_STAFF_USER_ID = '705770837399306332';
const DEFAULT_STAFF_ROLE_ID = '1426822811036684338';
const VERIFY_CHANNEL_ID = '1506243835708313681';
const GET_ROLE_CHANNEL_ID = '1426746103616897130';
const INTRO_CHANNEL_ID = '1506284754818044019';

const OPEN_BUTTON_ID = 'verify_ticket:open';
const CLOSE_BUTTON_ID = 'verify_ticket:close';
const MODAL_ID = 'verify_ticket:modal';
const ISSUE_FIELD_ID = 'verify_ticket:issue';
const DETAILS_FIELD_ID = 'verify_ticket:details';
const WAITING_MESSAGE_DELETE_MS = 10 * 60 * 1000;
const creatingTicketFor = new Map();

function getTicketOwnerId(channel) {
  const topic = channel?.topic || '';
  return (
    topic.match(/support-ticket-user:(\d+)/)?.[1] ||
    topic.match(/verify-ticket-user:(\d+)/)?.[1] ||
    null
  );
}

function isSupportTicketChannel(channel) {
  return Boolean(
    channel?.type === ChannelType.GuildText &&
      getTicketOwnerId(channel) &&
      !channel.topic?.includes('support-ticket-closed:true') &&
      !channel.topic?.includes('verify-ticket-closed:true'),
  );
}

function isTicketStaffMember(member, cfg = {}) {
  if (!member) return false;
  const staffUserId = cfg.staffUserId || DEFAULT_STAFF_USER_ID;
  const staffRoleId = cfg.staffRoleId || DEFAULT_STAFF_ROLE_ID;
  return Boolean(
    String(member.id) === String(staffUserId) ||
      member.roles?.cache?.has(staffRoleId) ||
      member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadTicketConfig() {
  return loadJson(CONFIG_PATH, {});
}

function saveTicketConfig(config) {
  saveJson(CONFIG_PATH, config);
}

function getGuildTicketConfig(guildId) {
  return loadTicketConfig()[String(guildId)] || null;
}

function toTicketSlug(user) {
  const base = (user?.username || user?.tag || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18);
  return base || 'member';
}

function buildTicketPanelEmbed(guildName = 'the server') {
  return new EmbedBuilder()
    .setColor(0x2b6cb0)
    .setTitle('Support Help Desk')
    .setDescription(
      `Need help in **${guildName}**? Open a ticket and tell us what you need help with.\n\n` +
        '**Use this if:**\n' +
        `• You cannot complete verification in <#${VERIFY_CHANNEL_ID}>\n` +
        `• Your roles in <#${GET_ROLE_CHANNEL_ID}> are not working\n` +
        `• Your introduction in <#${INTRO_CHANNEL_ID}> is not being accepted\n` +
        '• You need help with server access, permissions, roles, or other server concerns\n\n' +
        'Please explain the problem clearly so staff can help faster.',
    )
    .addFields(
      {
        name: 'Before opening a ticket',
        value:
          'If this is about verification, please check that you selected **Age**, **Relationship**, at least **one game/platform**, and posted a complete introduction.',
        inline: false,
      },
      {
        name: 'What happens next',
        value:
          'A private ticket channel will be created for you. Staff will be notified automatically.',
        inline: false,
      },
      {
        name: 'While waiting',
        value:
          'You may mention **JanJan/Pogi** inside your ticket for formal English help. If no staff member has responded yet, member messages may be cleaned up after **10 minutes** to keep tickets organized.',
        inline: false,
      },
    )
    .setFooter({ text: 'JanJan Support Desk' })
    .setTimestamp();
}

function buildTicketPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(OPEN_BUTTON_ID)
        .setLabel('Open Support Ticket')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildCloseComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CLOSE_BUTTON_ID)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildIssueModal() {
  return new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Support Ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(ISSUE_FIELD_ID)
          .setLabel('What is the problem?')
          .setPlaceholder('Example: I cannot verify, my role is missing, or I need help.')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(DETAILS_FIELD_ID)
          .setLabel('Explain what happened')
          .setPlaceholder('Tell us what happened, what you already tried, or any error/message you saw.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(900),
      ),
    );
}

function buildTicketIntroEmbed({ member, issue, details }) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Support Ticket')
    .setDescription(
      'A staff member will check this ticket as soon as possible.\n\n' +
        '**Please keep all details here so the conversation stays organized.**',
    )
    .addFields(
      {
        name: 'Member',
        value: `${member} \`${member.id}\``,
        inline: false,
      },
      {
        name: 'Problem',
        value: issue.slice(0, 1024),
        inline: false,
      },
      {
        name: 'Details',
        value: details.slice(0, 1024),
        inline: false,
      },
      {
        name: 'Helpful links',
        value:
          `<#${VERIFY_CHANNEL_ID}> — verification\n` +
          `<#${GET_ROLE_CHANNEL_ID}> — roles\n` +
          `<#${INTRO_CHANNEL_ID}> — introduction`,
        inline: false,
      },
      {
        name: 'While waiting for staff',
        value:
          'You can mention **JanJan/Pogi** here for formal English guidance. If no staff/admin has replied yet, your waiting messages may auto-delete after **10 minutes**.',
        inline: false,
      },
    )
    .setFooter({ text: 'JanJan Support Desk' })
    .setTimestamp();
}

async function setupVerificationTicketPanel(client, guildId = DEFAULT_GUILD, {
  channelId = DEFAULT_SPAWNPOINT_CHANNEL,
  staffUserId = DEFAULT_STAFF_USER_ID,
  staffRoleId = DEFAULT_STAFF_ROLE_ID,
} = {}) {
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased?.()) throw new Error('Ticket panel channel is not text-based');

  const config = loadTicketConfig();
  const prev = config[String(guildId)] || {};
  let panelMessage = prev.panelMessageId
    ? await channel.messages.fetch(prev.panelMessageId).catch(() => null)
    : null;

  // Delete old panel if present
  if (panelMessage?.deletable) await panelMessage.delete().catch(() => {});

  // Send as server via webhook (banner + embed + button)
  const { buffer: bannerBuf, filename: bannerFile } = await generateChannelBanner({
    title: 'SUPPORT',
    subtitle: 'Open a ticket to reach the staff team',
    accentHex: '#fee75c',
    filename: 'ticket-banner.gif',
  });
  const hook = await getOrCreateGuildWebhook(channel, client);
  const whMsg = await hook.send({
    files: [new AttachmentBuilder(bannerBuf, { name: bannerFile })],
    embeds: [buildTicketPanelEmbed(guild.name)],
    components: buildTicketPanelComponents(),
  });
  panelMessage = await channel.messages.fetch(whMsg.id);

  config[String(guildId)] = {
    ...prev,
    channelId,
    panelMessageId: panelMessage.id,
    staffUserId,
    staffRoleId,
  };
  saveTicketConfig(config);

  return { channel, message: panelMessage, staffUserId, staffRoleId };
}

async function findExistingOpenTicket(guild, userId) {
  await guild.channels.fetch().catch(() => null);
  return guild.channels.cache.find((ch) =>
    ch?.type === ChannelType.GuildText &&
    (ch.topic?.includes(`support-ticket-user:${userId}`) ||
      ch.topic?.includes(`verify-ticket-user:${userId}`)) &&
    !ch.topic?.includes('support-ticket-closed:true') &&
    !ch.topic?.includes('verify-ticket-closed:true'));
}

async function createVerificationTicket(interaction) {
  const cfg = getGuildTicketConfig(interaction.guildId) || {};
  const staffUserId = cfg.staffUserId || DEFAULT_STAFF_USER_ID;
  const staffRoleId = cfg.staffRoleId || DEFAULT_STAFF_ROLE_ID;
  const guild = interaction.guild;
  const member = interaction.member || (await guild.members.fetch(interaction.user.id));
  const lockKey = `${interaction.guildId}:${interaction.user.id}`;

  const issue = interaction.fields.getTextInputValue(ISSUE_FIELD_ID).trim();
  const details = interaction.fields.getTextInputValue(DETAILS_FIELD_ID).trim();

  if (creatingTicketFor.has(lockKey)) {
    await interaction.reply({
      content: 'Your ticket is already being created. Please wait a moment.',
      ephemeral: true,
    });
    return;
  }
  creatingTicketFor.set(lockKey, Date.now());

  try {
    const existing = await findExistingOpenTicket(guild, interaction.user.id);
    if (existing) {
      await interaction.reply({
        content: `You already have an open ticket: <#${existing.id}>`,
        ephemeral: true,
      });
      return;
    }

    const me = guild.members.me || (await guild.members.fetchMe());
    const parentId = interaction.channel?.parentId || null;
    const channel = await guild.channels.create({
      name: `ticket-${toTicketSlug(interaction.user)}`,
      type: ChannelType.GuildText,
      parent: parentId || undefined,
      topic: `support-ticket-user:${interaction.user.id} | opened:${new Date().toISOString()}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AttachFiles,
          ],
        },
        {
          id: staffUserId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
        {
          id: staffRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
        {
          id: me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ],
      reason: `Support ticket for ${interaction.user.tag}`,
    });

    const embed = buildTicketIntroEmbed({ member, issue, details });
    await channel.send({
      content:
        `<@${staffUserId}> <@&${staffRoleId}> New support ticket from ${interaction.user}.\n` +
        `Problem: **${issue.slice(0, 120)}**`,
      embeds: [embed],
      components: buildCloseComponents(),
      allowedMentions: { users: [staffUserId, interaction.user.id], roles: [staffRoleId] },
    });

    await interaction.reply({
      content: `Your support ticket has been created: <#${channel.id}>`,
      ephemeral: true,
    });
  } finally {
    setTimeout(() => creatingTicketFor.delete(lockKey), 30_000);
  }
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  if (!isSupportTicketChannel(channel)) return;

  const cfg = getGuildTicketConfig(interaction.guildId) || {};
  const staffUserId = cfg.staffUserId || DEFAULT_STAFF_USER_ID;
  const userId = getTicketOwnerId(channel);
  const isOwner = userId && String(interaction.user.id) === String(userId);
  const canManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
  const isStaff = String(interaction.user.id) === String(staffUserId);

  if (!isOwner && !isStaff && !canManage) {
    await interaction.reply({
      content: 'Only the ticket owner or staff can close this ticket.',
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: 'Closing this ticket in 5 seconds.',
    ephemeral: false,
  });

  await channel.setTopic(`${channel.topic} | support-ticket-closed:true`).catch(() => {});
  setTimeout(() => {
    channel.delete(`Support ticket closed by ${interaction.user.tag}`).catch(() => {});
  }, 5000);
}

async function isReplyToBot(message) {
  if (!message.reference?.messageId) return false;
  const referenced = await message.fetchReference().catch(() => null);
  return Boolean(referenced?.author?.id === message.client.user.id);
}

function buildSupportDeskEmbed({ guildName, ticketOwner, readiness, askedBy }) {
  const isOwner = String(askedBy.id) === String(ticketOwner.id);
  const title = readiness.ok
    ? 'Verification Checklist Complete'
    : 'Verification Checklist Review';

  const description = readiness.ok
    ? `${ticketOwner}, your verification requirements appear to be complete. Please return to <#${VERIFY_CHANNEL_ID}> and use the verification reaction on the official message.`
    : `${ticketOwner}, I checked the current verification requirements and found the items below still need attention.`;

  const embed = new EmbedBuilder()
    .setColor(readiness.ok ? 0x57f287 : 0xfee75c)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      {
        name: 'Server Guidelines',
        value:
          `Please review <#1426746103616897125>, complete your roles in <#${GET_ROLE_CHANNEL_ID}>, ` +
          `post your introduction in <#${INTRO_CHANNEL_ID}>, then verify in <#${VERIFY_CHANNEL_ID}>.`,
        inline: false,
      },
      {
        name: readiness.ok ? 'Status' : 'Missing Requirements',
        value: readiness.ok
          ? 'Age, relationship, game/platform selection, and introduction are complete.'
          : readiness.blockers
              .map((b) => `**${b.title}**\n${b.detail}`)
              .join('\n\n')
              .slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({
      text: `JanJan Support Desk · ${guildName}${isOwner ? '' : ' · reviewed ticket owner'}`,
    })
    .setTimestamp();

  return embed;
}

async function handleTicketMention(message) {
  if (message.author?.bot || !message.guild) return false;
  if (!isSupportTicketChannel(message.channel)) return false;

  const mentioned = message.mentions?.has(message.client.user);
  const replied = await isReplyToBot(message);
  if (!mentioned && !replied) return false;

  const ownerId = getTicketOwnerId(message.channel) || message.author.id;
  const ticketOwner = await message.guild.members.fetch(ownerId).catch(() => null);
  if (!ticketOwner) {
    await message.reply({
      content:
        'I can help here, but I could not identify the ticket owner. Please explain the issue clearly and wait for staff assistance.',
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  await message.channel.sendTyping().catch(() => {});
  const readiness = await checkVerifyReadiness(ticketOwner, message.guild.id, {
    client: message.client,
  });
  const embed = buildSupportDeskEmbed({
    guildName: message.guild.name,
    ticketOwner,
    readiness,
    askedBy: message.author,
  });

  const blockText = formatVerifyBlockMessage(readiness);
  const content = readiness.ok
    ? 'I reviewed the ticket owner’s verification status. The checklist appears complete.'
    : 'I reviewed the ticket owner’s verification status. These are the current blockers.';

  await message.reply({
    content,
    embeds: [embed],
    allowedMentions: { repliedUser: false },
  });

  if (blockText && blockText.length <= 1700) {
    await message.channel.send({
      content: `Reference checklist:\n\n${blockText}`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }

  return true;
}

async function hasStaffReplyAfter(message, cfg) {
  const messages = await message.channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return false;

  for (const msg of messages.values()) {
    if (msg.author?.bot) continue;
    if (msg.createdTimestamp <= message.createdTimestamp) continue;
    const member = msg.member || (await msg.guild.members.fetch(msg.author.id).catch(() => null));
    if (isTicketStaffMember(member, cfg)) return true;
  }

  return false;
}

async function scheduleWaitingMessageCleanup(message) {
  if (message.author?.bot || !message.guild) return false;
  if (!isSupportTicketChannel(message.channel)) return false;

  const cfg = getGuildTicketConfig(message.guild.id) || {};
  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (isTicketStaffMember(member, cfg)) return false;

  setTimeout(async () => {
    const fresh = await message.channel.messages.fetch(message.id).catch(() => null);
    if (!fresh) return;

    if (await hasStaffReplyAfter(fresh, cfg)) return;

    await fresh
      .delete('JanJan support ticket cleanup: no staff response within 10 minutes')
      .catch((err) => console.warn('[TICKETS] cleanup skip:', err.message));
  }, WAITING_MESSAGE_DELETE_MS);

  return true;
}

function registerVerificationTicketHandlers(client) {
  if (client._verificationTicketHandlersRegistered) return;
  client._verificationTicketHandlersRegistered = true;

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) {
        await interaction.showModal(buildIssueModal());
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        await createVerificationTicket(interaction);
        return;
      }
      if (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID) {
        await closeTicket(interaction);
      }
    } catch (err) {
      console.error('[TICKETS] interaction:', err.message);
      const payload = {
        content: `Ticket action failed: ${err.message}`,
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await scheduleWaitingMessageCleanup(message);
      await handleTicketMention(message);
    } catch (err) {
      console.error('[TICKETS] message:', err.message);
    }
  });

  console.log('[TICKETS] Support ticket handlers registered');
}

module.exports = {
  DEFAULT_GUILD,
  DEFAULT_SPAWNPOINT_CHANNEL,
  DEFAULT_STAFF_USER_ID,
  DEFAULT_STAFF_ROLE_ID,
  setupVerificationTicketPanel,
  registerVerificationTicketHandlers,
  buildTicketPanelEmbed,
  buildTicketPanelComponents,
  isSupportTicketChannel,
  getTicketOwnerId,
};
