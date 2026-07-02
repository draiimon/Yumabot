import axios from 'axios';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { allEntries } = require('../src/roleMenu/definitions.js');
const { resolveGameIconUrl } = require('../src/roleMenu/iconSources.js');

const games = allEntries().filter((e) => e.key.startsWith('g_'));
let ok = 0;
let fail = 0;
for (const e of games) {
  const src = resolveGameIconUrl(e.key);
  if (!src) {
    console.log('MISSING', e.key);
    fail += 1;
    continue;
  }
  try {
    const r = await axios.head(src.url, { timeout: 10000 });
    if (r.status === 200) {
      console.log('OK', e.key, src.source);
      ok += 1;
    } else {
      console.log('BAD', e.key, r.status);
      fail += 1;
    }
  } catch {
    console.log('FAIL', e.key, src.url);
    fail += 1;
  }
}
console.log(`\n${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
