const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

let cachedFfmpeg = undefined;

function getFfmpegCandidates() {
  const list = [];
  if (process.env.FFMPEG_PATH) list.push(process.env.FFMPEG_PATH);
  try {
    list.push(require('ffmpeg-static'));
  } catch {
    /* */
  }
  list.push('ffmpeg', 'C:\\ffmpeg\\bin\\ffmpeg.exe');
  return [...new Set(list.filter(Boolean))];
}

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Returns path only if ffmpeg -version succeeds (skips broken ffmpeg-static builds). */
async function probeFfmpeg() {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;
  for (const candidate of getFfmpegCandidates()) {
    try {
      const out = await execFileAsync(candidate, ['-version']);
      if (out && out.includes('ffmpeg version')) {
        cachedFfmpeg = candidate;
        return candidate;
      }
    } catch {
      /* try next */
    }
  }
  cachedFfmpeg = null;
  return null;
}

function encodeFramesToMp4(frameDir, frameCount, { loopSec, outFps = 60, crf = 15 }, ffmpegPath) {
  const outPath = path.join(frameDir, 'welcome.mp4');
  const inputFps = frameCount / loopSec;

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-framerate',
      String(inputFps),
      '-i',
      path.join(frameDir, 'frame_%05d.png'),
      '-vf',
      `fps=${outFps},format=yuv420p`,
      '-c:v',
      'libx264',
      '-crf',
      String(crf),
      '-preset',
      'fast',
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      '-t',
      String(loopSec),
      outPath,
    ];

    execFile(ffmpegPath, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (runErr, _out, stderr) => {
      if (runErr) return reject(new Error(stderr?.trim() || runErr.message));
      fs.readFile(outPath, (e, buf) => {
        if (e) reject(e);
        else resolve(buf);
      });
    });
  });
}

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'janjan-welcome-'));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  probeFfmpeg,
  encodeFramesToMp4,
  withTempDir,
};
