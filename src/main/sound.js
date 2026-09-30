'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Plays the alert sound using the OS-native player so it works
 * regardless of whether the app window is visible/focused.
 * Falls back silently if the file/player is unavailable.
 */
function playAlertSound() {
  const soundPath = path.join(__dirname, '..', '..', 'assets', 'sounds', 'alert.wav');
  if (!fs.existsSync(soundPath)) return;

  try {
    if (process.platform === 'darwin') {
      spawn('afplay', [soundPath], { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      const psCommand = `(New-Object Media.SoundPlayer '${soundPath}').PlaySync();`;
      spawn('powershell', ['-c', psCommand], { stdio: 'ignore' });
    } else {
      // Linux: try paplay, fall back to aplay
      const player = spawn('paplay', [soundPath], { stdio: 'ignore' });
      player.on('error', () => {
        spawn('aplay', [soundPath], { stdio: 'ignore' });
      });
    }
  } catch (err) {
    // Non-fatal: sound is best-effort
  }
}

module.exports = { playAlertSound };
