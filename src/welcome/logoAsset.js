const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_LOGO = path.join(__dirname, '..', '..', 'assets', 'playground-logo.png');
const TRANSPARENT_LOGO = path.join(__dirname, '..', '..', 'assets', 'playground-logo-transparent.png');

/** Remove dark/black JPEG background so logo blends on the card. */
async function ensureTransparentLogoPng() {
  if (fs.existsSync(TRANSPARENT_LOGO)) {
    const meta = await sharp(TRANSPARENT_LOGO).metadata();
    if (meta.hasAlpha) return TRANSPARENT_LOGO;
  }

  const { data, info } = await sharp(SOURCE_LOGO)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (lum < 55 || (lum < 90 && sat < 0.25)) {
      data[i + 3] = 0;
    } else if (lum < 110 && sat < 0.15) {
      data[i + 3] = Math.min(data[i + 3], Math.floor((lum - 55) * 5));
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(TRANSPARENT_LOGO);
  return TRANSPARENT_LOGO;
}

module.exports = { ensureTransparentLogoPng, TRANSPARENT_LOGO };
