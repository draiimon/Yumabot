const fs = require('fs');
const { spawn } = require('child_process');
const { Communicate } = require('edge-tts-universal');

async function generateTtsWithNode(text, voice, outputFile) {
  const communicate = new Communicate(text, {
    voice,
    rate: '+10%',
    volume: '+30%',
    connectionTimeout: 20000,
  });

  const buffers = [];
  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) {
      buffers.push(chunk.data);
    }
  }

  const audio = Buffer.concat(buffers);
  if (audio.length < 100) {
    throw new Error('Node TTS produced empty audio');
  }

  fs.writeFileSync(outputFile, audio);
}

function resolvePythonCommand() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function generateTtsWithPython(text, voice, outputFile) {
  return new Promise((resolve, reject) => {
    const py = spawn(resolvePythonCommand(), ['tts.py', text, voice, outputFile], {
      cwd: require('path').join(__dirname, '..', '..'),
    });
    let stderr = '';
    py.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tts.py exited ${code}: ${stderr.trim()}`));
        return;
      }
      resolve();
    });
    py.on('error', reject);
  });
}

async function generateTtsAudio(text, voice, outputFile) {
  try {
    await generateTtsWithNode(text, voice, outputFile);
    return 'node';
  } catch (nodeErr) {
    console.warn('[TTS] Node engine failed, trying python3:', nodeErr.message);
    await generateTtsWithPython(text, voice, outputFile);
    return 'python';
  }
}

async function probeTtsEngines() {
  const result = { node: false, python: false, nodeError: null, pythonError: null };

  try {
    const communicate = new Communicate('ok', {
      voice: 'fil-PH-AngeloNeural',
      rate: '+10%',
      volume: '+30%',
      connectionTimeout: 15000,
    });
    let bytes = 0;
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        bytes += chunk.data.length;
      }
    }
    result.node = bytes >= 100;
    if (!result.node) {
      result.nodeError = 'probe returned no audio';
    }
  } catch (err) {
    result.nodeError = err.message;
  }

  try {
    const tmpFile = require('os').tmpdir() + require('path').sep + `tts_probe_${Date.now()}.mp3`;
    await generateTtsWithPython('ok', 'fil-PH-AngeloNeural', tmpFile);
    result.python = fs.existsSync(tmpFile) && fs.statSync(tmpFile).size >= 100;
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  } catch (err) {
    result.pythonError = err.message;
  }

  return result;
}

module.exports = {
  generateTtsAudio,
  probeTtsEngines,
};
