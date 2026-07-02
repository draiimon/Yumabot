/**
 * Minimal Edge TTS client that outputs WebM Opus directly.
 *
 * Bypasses ffmpeg by requesting opus-formatted audio from Microsoft Edge's
 * TTS WebSocket endpoint. The returned buffer is a complete WebM file
 * containing Opus audio frames, playable directly via @discordjs/voice's
 * StreamType.WebmOpus (no transcoding).
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const { randomUUID } = crypto;

const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];

const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

// WebM Opus — directly playable by @discordjs/voice without ffmpeg
const OUTPUT_FORMAT = 'webm-24khz-16bit-mono-opus';

function getTimestamp() {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

function generateSecMsGec() {
  // .NET ticks since 0001-01-01 UTC, floored to nearest 5 minutes
  const WIN_EPOCH = 11644473600; // seconds from 0001-01-01 to 1970-01-01
  const S_TO_NS = 1e9;
  let ticks = Date.now() / 1000 + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100; // convert to 100ns intervals
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function connectId() {
  return randomUUID().replace(/-/g, '');
}

function escapeSSML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSSML(text, voice, rate, volume, pitch) {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
    `${escapeSSML(text)}` +
    `</prosody></voice></speak>`
  );
}

function buildConfigMessage() {
  return (
    `X-Timestamp:${getTimestamp()}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}\r\n`
  );
}

function buildSsmlMessage(requestId, ssml) {
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${getTimestamp()}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml
  );
}

/**
 * Synthesize text to a WebM Opus buffer using Edge TTS.
 * Waits for full audio before resolving.
 */
function synthesizeOpus(text, opts = {}) {
  return new Promise((resolve, reject) => {
    const stream = synthesizeOpusStream(text, opts);
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (buffer.length < 100) reject(new Error('Edge TTS: no audio received'));
      else resolve(buffer);
    });
    stream.on('error', reject);
  });
}

/**
 * Stream WebM Opus chunks from Edge TTS as they arrive.
 * Returns immediately with a Readable stream — audio plays as it's synthesized.
 *
 * @param {string} text - Text to speak.
 * @param {object} opts
 * @param {string} opts.voice - Voice name (e.g. 'fil-PH-AngeloNeural').
 * @param {string} [opts.rate='+10%'] - Speech rate.
 * @param {string} [opts.volume='+30%'] - Volume.
 * @param {string} [opts.pitch='+0Hz'] - Pitch.
 * @param {number} [opts.timeoutMs=20000] - WebSocket timeout.
 * @returns {Readable} Audio stream (WebM Opus).
 */
function synthesizeOpusStream(text, opts = {}) {
  const { Readable } = require('stream');
  const {
    voice = 'fil-PH-AngeloNeural',
    rate = '+10%',
    volume = '+30%',
    pitch = '+0Hz',
    timeoutMs = 20000,
  } = opts;

  const stream = new Readable({ read() {} });

  if (!text || !String(text).trim()) {
    process.nextTick(() => stream.emit('error', new Error('Edge TTS: empty text')));
    return stream;
  }

  const requestId = connectId();
  const url = `${WSS_URL}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}&ConnectionId=${connectId()}`;

  const ws = new WebSocket(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  let finished = false;
  let receivedBytes = 0;

  const timer = setTimeout(() => {
    if (finished) return;
    finished = true;
    try { ws.terminate(); } catch { /* noop */ }
    stream.emit('error', new Error(`Edge TTS: timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    try { ws.close(); } catch { /* noop */ }
  };

  ws.on('open', () => {
    try {
      ws.send(buildConfigMessage());
      ws.send(buildSsmlMessage(requestId, buildSSML(text, voice, rate, volume, pitch)));
    } catch (err) {
      if (finished) return;
      finished = true;
      cleanup();
      stream.emit('error', err);
    }
  });

  ws.on('message', (data, isBinary) => {
    if (finished) return;

    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 2) return;
      const headerLen = buf.readUInt16BE(0);
      if (buf.length < 2 + headerLen) return;
      const audio = buf.slice(2 + headerLen);
      if (audio.length > 0) {
        receivedBytes += audio.length;
        stream.push(audio); // push to stream as soon as received
      }
    } else {
      const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
      if (text.includes('Path:turn.end')) {
        finished = true;
        cleanup();
        if (receivedBytes < 100) {
          stream.emit('error', new Error('Edge TTS: no audio received'));
        } else {
          stream.push(null); // signal end of stream
        }
      }
    }
  });

  ws.on('error', (err) => {
    if (finished) return;
    finished = true;
    cleanup();
    stream.emit('error', err);
  });

  ws.on('close', (code, reasonBuf) => {
    if (finished) return;
    finished = true;
    cleanup();
    const reason = reasonBuf ? Buffer.from(reasonBuf).toString('utf8') : '';
    stream.emit('error', new Error(`Edge TTS: WebSocket closed (${code})${reason ? `: ${reason}` : ''}`));
  });

  return stream;
}

module.exports = { synthesizeOpus, synthesizeOpusStream };
