/**
 * Human-readable j!vc / voice join errors (malandi tone, actionable).
 */
function formatVoiceConnectError(err) {
  const code = String(err?.code || err?.message || 'unknown').toLowerCase();
  const msg = String(err?.message || '');

  if (code === 'not-in-voice') {
    return 'Sumali ka muna sa voice, mare — wala akong kakantahan kung wala ka sa call.';
  }
  if (code === 'missing-voice-perms') {
    const detail = err.missing?.length ? ` Kulang: ${err.missing.join(', ')}.` : '';
    return `Hindi ako makapasok sa voice mo — walang perm ang bot.${detail} I-check role perms: Connect + Speak + View Channel sa channel na yan.`;
  }
  if (code === 'join-failed') {
    return 'Ayaw ako papasukin ng Discord (join failed). Subukan: `j!leave` tapos `j!vc` ulit, o i-restart ang bot sa Render kung stuck.';
  }
  if (code === 'music-blocks-voice') {
    return 'Busy ako sa music session ngayon. Stop mo muna ang music bago `j!vc`.';
  }
  if (
    code === 'voice-aborted' ||
    code === 'voice-timeout' ||
    /aborted|cannot transition|timed out|timeout/i.test(msg)
  ) {
    return 'Na-interrupt ang voice connect (stale session). Subukan: `j!leave` → wait 3s → sumali ulit sa VC → `j!vc hi`. Kung paulit-ulit, i-redeploy ang bot sa Render.';
  }

  return `Hindi ako maka-connect sa voice: ${msg || code}. Check Connect + Speak, tapos j!leave tapos j!vc ulit.`;
}

module.exports = { formatVoiceConnectError };
