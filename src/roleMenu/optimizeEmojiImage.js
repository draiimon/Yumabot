const sharp = require('sharp');

const EMOJI_PX = Number(process.env.ROLE_MENU_EMOJI_PX) || 128;
const MAX_BYTES = 256 * 1024;

/**
 * Downscale/compress any official logo to a Discord-friendly square PNG.
 */
async function optimizeForDiscordEmoji(inputBuffer) {
  const sizes = [EMOJI_PX, 96, 72];
  let lastErr;

  for (const px of sizes) {
    try {
      const out = await sharp(inputBuffer, { failOn: 'none' })
        .resize(px, px, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9, effort: 10, palette: px <= 96 })
        .toBuffer();

      if (out.length <= MAX_BYTES) {
        console.log(
          `[ROLE-MENU]   optimized ${inputBuffer.length} → ${out.length} bytes (${px}×${px} PNG)`,
        );
        return out;
      }
      lastErr = new Error(`still ${out.length} bytes at ${px}px`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('could not optimize image for Discord emoji');
}

module.exports = { optimizeForDiscordEmoji, EMOJI_PX, MAX_BYTES };
