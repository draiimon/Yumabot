const { allEntries, GROUPS } = require('../roleMenu/definitions');
const { getGuildRoleMenuConfig } = require('../roleMenu/roleMenuSystem');
const GROUP_LABELS = {
  age: { title: 'Age', icon: '🎂' },
  relationship: { title: 'Relationship', icon: '💕' },
  games_a: { title: 'Games & platforms', icon: '🎮' },
  games_b: { title: 'Games & platforms', icon: '🎮' },
  games_c: { title: 'Games & platforms', icon: '🎮' },
};

function findGroupForKey(key) {
  for (const [groupId, group] of Object.entries(GROUPS)) {
    if (group.type === 'info') continue;
    if (group.entries.some((e) => e.key === key)) return groupId;
  }
  return null;
}

function collectRoleMenuPicks(member, guildId) {
  const cfg = getGuildRoleMenuConfig(guildId);
  if (!cfg?.mappings) return { sections: [], total: 0 };

  const roleIdToEntry = new Map();
  for (const entry of allEntries()) {
    const roleId = cfg.mappings[entry.key]?.roleId;
    if (roleId) {
      roleIdToEntry.set(String(roleId), {
        entry,
        meta: cfg.mappings[entry.key],
        group: cfg.mappings[entry.key].group || findGroupForKey(entry.key),
      });
    }
  }

  const byGroup = new Map();
  for (const role of member.roles.cache.values()) {
    const hit = roleIdToEntry.get(String(role.id));
    if (!hit) continue;
    const g = hit.group || 'games_a';
    if (!byGroup.has(g)) byGroup.set(g, []);
    const icon =
      hit.meta?.emojiDisplay ||
      (hit.meta?.emojiId && hit.meta?.emoji
        ? `<:${hit.meta.emoji}:${hit.meta.emojiId}>`
        : hit.entry.emoji);
    byGroup.get(g).push({ role, icon, label: hit.entry.label });
  }

  const sections = [];
  const order = ['age', 'relationship', 'games_a', 'games_b', 'games_c'];
  for (const groupId of order) {
    const items = byGroup.get(groupId);
    if (!items?.length) continue;
    const gl = GROUP_LABELS[groupId] || { title: groupId, icon: '✨' };
    const lines = items
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => `${x.icon} ${x.role}`)
      .join('\n');
    const existing = sections.find((s) => s.name.startsWith(gl.icon));
    if (existing) {
      existing.value += `\n${lines}`;
    } else {
      sections.push({
        name: `${gl.icon} ${gl.title}`,
        value: lines,
        inline: false,
      });
    }
  }

  const total = [...byGroup.values()].reduce((n, arr) => n + arr.length, 0);
  return { sections, total };
}

module.exports = { collectRoleMenuPicks };
