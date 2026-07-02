/**
 * Export all get-role game icons as named PNGs + zip for manual Discord upload.
 * Filenames = exact bot emoji names (rm_g_valorant.png, etc.)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.SKIP_EMOJI_GG_WARMUP = '1';

const { allGameEntries } = require('../src/roleMenu/definitions.js');
const { fetchIconBuffer, emojiNameForEntry } = require('../src/roleMenu/guildEmojiIcons.js');

const OUT_DIR = path.join(process.cwd(), 'exports', 'role-menu-emojis');
const ZIP_PATH = path.join(process.cwd(), 'exports', 'get-role-emojis.zip');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = allGameEntries();
  const manifest = [];

  console.log(`Exporting ${entries.length} icons to ${OUT_DIR}\n`);

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = emojiNameForEntry(entry);
    const filename = `${name}.png`;
    const filePath = path.join(OUT_DIR, filename);

    process.stdout.write(`[${i + 1}/${entries.length}] ${entry.label} → ${filename} … `);
    try {
      const buffer = await fetchIconBuffer(entry);
      fs.writeFileSync(filePath, buffer);
      manifest.push({
        key: entry.key,
        label: entry.label,
        roleName: entry.roleName,
        emojiName: name,
        file: filename,
        bytes: buffer.length,
      });
      console.log(`ok (${buffer.length} bytes)`);
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      manifest.push({
        key: entry.key,
        label: entry.label,
        emojiName: name,
        file: filename,
        error: err.message,
      });
    }
  }

  const readme = `# Get-role emoji pack (${entries.length} icons)

Upload these in **Discord Developer Portal → Your App → Emojis**.

## File names = Discord emoji names
Each PNG is already named exactly what Discord expects, e.g.:
- \`rm_g_valorant.png\` → emoji name **rm_g_valorant**
- \`rm_g_roblox.png\` → emoji name **rm_g_roblox**

**Do not rename files** before upload (unless Discord auto-fills the name from filename).

## Steps
1. Delete all old \`rm_*\` emojis in the Developer Portal (or run bot cleanup first).
2. Upload every PNG from this folder (32 files).
3. Run: \`node scripts/cleanup-duplicate-emojis.mjs --repair\`
   OR \`j!fixrolemenu\` in Discord so reactions link to the new emoji IDs.

## Manifest
| File | Game / role | Config key |
|------|-------------|------------|
${manifest
  .filter((m) => !m.error)
  .map((m) => `| \`${m.file}\` | ${m.label} | \`${m.key}\` |`)
  .join('\n')}

Generated: ${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(OUT_DIR, 'README.txt'), readme, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  fs.mkdirSync(path.dirname(ZIP_PATH), { recursive: true });

  const isWin = process.platform === 'win32';
  if (isWin) {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${OUT_DIR.replace(/'/g, "''")}\\*' -DestinationPath '${ZIP_PATH.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`cd "${path.dirname(OUT_DIR)}" && zip -r "${ZIP_PATH}" "${path.basename(OUT_DIR)}"`, {
      stdio: 'inherit',
    });
  }

  const ok = manifest.filter((m) => !m.error).length;
  console.log(`\n✅ Exported ${ok}/${entries.length} PNGs`);
  console.log(`   Folder: ${OUT_DIR}`);
  console.log(`   Zip:    ${ZIP_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
