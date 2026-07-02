#!/usr/bin/env node
/**
 * Local voice/TTS stack test (no Discord login required).
 * Run: node scripts/test-voice-stack.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

require('opusscript');

const { generateDependencyReport } = require('@discordjs/voice');
const { generateTtsAudio, probeTtsEngines } = require('../src/voice/generateTtsAudio.js');

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('\n=== JanJan Voice Stack Test ===\n');

const dep = generateDependencyReport();
console.log(dep);

const hasOpus = /opusscript|@discordjs\/opus/.test(dep);
if (hasOpus) pass('Opus decoder');
else fail('Opus decoder', 'install opusscript');

try {
  new (require('prism-media').opus.Decoder)({ rate: 48000, channels: 2, frameSize: 960 });
  pass('prism Opus.Decoder instantiates');
} catch (e) {
  fail('prism Opus.Decoder', e.message);
}

process.env.FFMPEG_PATH = require('ffmpeg-static');
if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
  pass('ffmpeg-static', process.env.FFMPEG_PATH);
} else {
  fail('ffmpeg-static', 'path missing');
}

const tmpMp3 = path.join(os.tmpdir(), `janjan_tts_test_${Date.now()}.mp3`);
try {
  const engine = await generateTtsAudio('Kumusta, test lang ito.', 'fil-PH-AngeloNeural', tmpMp3);
  const size = fs.statSync(tmpMp3).size;
  if (size >= 100) pass('TTS generate', `${engine}, ${size} bytes`);
  else fail('TTS generate', `too small: ${size}`);
  fs.unlinkSync(tmpMp3);
} catch (e) {
  fail('TTS generate', e.message);
}

try {
  const probe = await probeTtsEngines();
  if (probe.node) pass('TTS probe node');
  else fail('TTS probe node', probe.nodeError || 'no audio');
  if (probe.python) pass('TTS probe python');
  else console.warn(`⚠️  TTS python fallback: ${probe.pythonError || 'n/a'}`);
} catch (e) {
  fail('TTS probe', e.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===\n`);
process.exit(failed.length > 0 ? 1 : 0);
