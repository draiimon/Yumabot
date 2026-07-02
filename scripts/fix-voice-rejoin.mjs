import fs from 'fs';

const filePath = './index.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the start of Disconnect handler block
const startMarker = '    // BULLETPROOF Disconnect handler';
// Try both LF and CRLF
const endMarkerLF = "        scheduleVoiceRejoin('destroyed', delay);\n      }\n    });";
const endMarkerCRLF = "        scheduleVoiceRejoin('destroyed', delay);\r\n      }\r\n    });";
const endMarker = content.includes(endMarkerCRLF) ? endMarkerCRLF : endMarkerLF;
console.log('Line ending:', endMarker === endMarkerCRLF ? 'CRLF' : 'LF');

const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Start marker not found');
  process.exit(1);
}

const endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) {
  console.error('End marker not found');
  process.exit(1);
}
const endFull = endIdx + endMarker.length;

console.log('Found block:', startIdx, '->', endFull, '| length:', endFull - startIdx);

const replacement = `    // Disconnected: let Discord auto-reconnect. NO manual rejoin scheduling (avoids connect loop).
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(\`[VOICE 24/7] Disconnected from \${guildId}; waiting for Discord auto-reconnect.\`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        try { connection.destroy(); } catch { }
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      runtimeState.voice.connectionStatus = VoiceConnectionStatus.Destroyed;
      console.log(\`[VOICE 24/7] Connection destroyed for guild \${guildId}\`);
    });`;

const newContent = content.slice(0, startIdx) + replacement + content.slice(endFull);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Replaced. Old:', content.length, 'New:', newContent.length, 'Saved:', content.length - newContent.length, 'chars');
