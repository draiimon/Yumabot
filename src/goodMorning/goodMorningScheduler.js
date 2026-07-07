'use strict';

// ── Good Morning Scheduler ──────────────────────────────────────────────────
// Sends a unique daily good morning message at 8:00 AM PHT
// Target user : 732157054793547888
// Target channel: 1433764006396432459

const TARGET_USER_ID    = '732157054793547888';
const TARGET_CHANNEL_ID = '1433764006396432459';

// ── Varied good morning messages ────────────────────────────────────────────
const MESSAGES = [
  (mention) => `${mention} GOODMORNING!!! 🌞 gising na beh, huwag mag-aantay pa si araw para sayo 😤`,
  (mention) => `${mention} uy! 8AM na!! maaga pa naman, goodmorning!! ☀️ kain ka na agad ha`,
  (mention) => `goodmorning ${mention}!! 🐓 tumitilaok na ang manok, sige na gising na`,
  (mention) => `${mention} rise and shine beshy!! 🌅 bagong umaga, bagong drama — ready ka na ba??`,
  (mention) => `goodmorning ${mention} 💛 sana hindi pa late sa trabaho/eskwela HAHA maaga ka naman`,
  (mention) => `${mention}!! GOODMORNING!! 🌤️ ako na ang alarm mo ngayon, di ka na puede mag snooze`,
  (mention) => `uy ${mention} heyy!! gising na!! 😴➡️😃 goodmorning, maligayang umaga sa inyo`,
  (mention) => `GOODMORNING ${mention}!! ✨ wala kang choice, gising na talaga. ingat sa araw mo ha!!`,
  (mention) => `${mention} 🌻 goodmorning!! sana ang ganda ng araw mo ngayon, deserving ka naman`,
  (mention) => `goodmorning ${mention}!! 🍳 may almusal ka na ba?? wag mag-skip, mahalaga yan!!`,
  (mention) => `${mention} hala gising na!! ⏰ goodmorning!! sana produktibo tayo ngayon ha`,
  (mention) => `goodmorning ${mention}!! 🌈 bago magsimula ang lahat ng gulo ngayon — goodvibes muna tayo`,
  (mention) => `${mention}!! kumusta naman ang tulog? goodmorning!! 😴✨ sana okay naman`,
  (mention) => `goodmorning ${mention}! 🌞 ang liwanag ng umaga, katulad mo — charot HAHA`,
  (mention) => `${mention} GOODMORNING GOODMORNING!! 🥳 excited na ko sa araw mo ngayon, ingat lagi`,
  (mention) => `uy ${mention}!! goodmorning!! ☕ may kape ka na ba? pag wala, bili ka na!!`,
  (mention) => `${mention} 🌄 goodmorning!! 8AM na hindi ka pa dapat nag-aaral ng pagod — fresh start!!`,
  (mention) => `goodmorning ${mention}!! 💪 today is gonna be a good day, I can feel it fr`,
  (mention) => `${mention} heyy!! goodmorning!! 🌸 ingat sa araw mo, lagi kitang binabantayan dito hehe`,
  (mention) => `GOODMORNING ${mention}!! 🔥 wag pabayaan ang sarili mo ngayon ha, ikaw muna bago iba`,
  (mention) => `${mention} ✨ magandang umaga!! bago ka mag-scroll ng socmed — goodmorning muna tayo`,
  (mention) => `goodmorning ${mention}!! 🐣 bagong araw bagong chances, seize it beh!!`,
  (mention) => `${mention} hala 8AM na!! GOODMORNING!! 🌞 anong plano mo ngayon?`,
  (mention) => `goodmorning ${mention}!! 🌊 sana smooth ang lahat ngayon, wala kang stress ha`,
  (mention) => `${mention}!! goodmorning!! 😊 ikaw yung una kong binebentoy ngayon — pribilehiyo yan`,
];

// ── PHT helpers ─────────────────────────────────────────────────────────────
function getPHT() {
  const now = new Date();
  // UTC+8
  const phtMs = now.getTime() + (8 * 60 * 60 * 1000);
  const pht   = new Date(phtMs);
  return {
    hour   : pht.getUTCHours(),
    minute : pht.getUTCMinutes(),
    dateKey: `${pht.getUTCFullYear()}-${pht.getUTCMonth()}-${pht.getUTCDate()}`,
  };
}

// Pick a message that's different from yesterday's index
let _lastIndex = -1;
function pickMessage(mention) {
  let idx;
  do {
    idx = Math.floor(Math.random() * MESSAGES.length);
  } while (idx === _lastIndex && MESSAGES.length > 1);
  _lastIndex = idx;
  return MESSAGES[idx](mention);
}

// ── Scheduler ────────────────────────────────────────────────────────────────
function startGoodMorningScheduler(client) {
  if (client._goodMorningStarted) return;
  client._goodMorningStarted = true;

  let _lastFiredKey = null;

  const tick = async () => {
    try {
      const { hour, minute, dateKey } = getPHT();
      if (hour !== 8 || minute !== 0) return;
      if (_lastFiredKey === dateKey) return;   // already sent today
      _lastFiredKey = dateKey;

      const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
      if (!channel) {
        console.error('[GM-SCHEDULER] Channel not found:', TARGET_CHANNEL_ID);
        return;
      }

      const mention = `<@${TARGET_USER_ID}>`;
      const msg     = pickMessage(mention);

      await channel.send(msg);
      console.log(`[GM-SCHEDULER] Good morning sent for ${dateKey}`);
    } catch (err) {
      console.error('[GM-SCHEDULER] Error:', err.message);
    }
  };

  // Check every minute
  setInterval(tick, 60_000).unref?.();
  console.log('[GM-SCHEDULER] Started — fires daily at 08:00 PHT in channel', TARGET_CHANNEL_ID);
}

module.exports = { startGoodMorningScheduler };
