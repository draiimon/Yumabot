async function getOrCreateGuildWebhook(channel, client) {
  const webhooks = await channel.fetchWebhooks();
  let hook = webhooks.find((w) => w.owner?.id === client.user.id);
  if (!hook) {
    const guild = channel.guild;
    const iconURL = guild.iconURL({ size: 256, extension: 'png' });
    let avatarBuffer = null;
    if (iconURL) {
      const res = await fetch(iconURL);
      if (res.ok) avatarBuffer = Buffer.from(await res.arrayBuffer());
    }
    hook = await channel.createWebhook({
      name: guild.name,
      avatar: avatarBuffer ?? undefined,
      reason: 'JanJan — server identity panel',
    });
    console.log(`[WEBHOOK] Created "${hook.name}" in #${channel.name}`);
  }
  return hook;
}

module.exports = { getOrCreateGuildWebhook };
