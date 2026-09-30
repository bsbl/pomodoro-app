'use strict';

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { APP_DATA_DIR, ensureDataDir } = require('./data-dir');

// Root of the project (this file lives at src/main/autostart.js).
const APP_DIR = path.resolve(__dirname, '..', '..');

const LABEL = 'com.sebastienbel.pomodoro-timer';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

function buildPlistContent() {
  // ProgramArguments points directly at the currently-running Electron
  // binary + this project's directory. launchd execs this directly (no
  // app-bundle relaunch involved), which is what makes it reliable — see
  // the macOS section below for why app.setLoginItemSettings isn't used.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${APP_DIR}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${path.join(APP_DATA_DIR, 'launchagent.out.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(APP_DATA_DIR, 'launchagent.err.log')}</string>
</dict>
</plist>
`;
}

function readExistingPlist() {
  try {
    return fs.readFileSync(PLIST_PATH, 'utf-8');
  } catch (err) {
    return null;
  }
}

function isLaunchAgentLoaded() {
  try {
    execFileSync('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * macOS: manages autostart via a launchd LaunchAgent instead of
 * app.setLoginItemSettings.
 *
 * Why: on modern macOS (Ventura/Sonoma+), setLoginItemSettings({path, args})
 * pointing at an unpackaged/dev Electron binary does not reliably forward
 * the custom args at actual login — macOS relaunches the login item through
 * its app-bundle relaunch mechanism (Launch Services / SMAppService), which
 * drops the args. The result observed: Electron starts at login with no
 * project path, showing its built-in default/blank app instead of Pomodoro.
 * A LaunchAgent, by contrast, has launchd exec the binary directly with its
 * arguments — already verified reliable via `launchctl kickstart`.
 *
 * Idempotency matters here: setAutoLaunchMac() is also called on every app
 * startup (to re-apply the saved preference), including when the app itself
 * was just started BY this same LaunchAgent. If enabling were to
 * unconditionally bootout+bootstrap, it could tear down (and briefly kill)
 * the very process that's currently running. So this only touches launchctl
 * when the on-disk/loaded state doesn't already match the desired state.
 */
function setAutoLaunchMac(enabled) {
  const desiredContent = buildPlistContent();
  const existingContent = readExistingPlist();
  const loaded = isLaunchAgentLoaded();

  if (enabled) {
    if (existingContent === desiredContent && loaded) {
      return; // already in the desired state, nothing to do
    }
    fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
    ensureDataDir();
    fs.writeFileSync(PLIST_PATH, desiredContent, 'utf-8');
    if (loaded) {
      // Reload to pick up any content changes (e.g. project moved).
      try {
        execFileSync('launchctl', ['bootout', `gui/${process.getuid()}`, PLIST_PATH], { stdio: 'ignore' });
      } catch (err) {
        // ignore — may already be unloaded
      }
    }
    execFileSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, PLIST_PATH], { stdio: 'ignore' });
  } else {
    if (existingContent === null && !loaded) {
      return; // already absent, nothing to do
    }
    if (loaded) {
      try {
        execFileSync('launchctl', ['bootout', `gui/${process.getuid()}`, PLIST_PATH], { stdio: 'ignore' });
      } catch (err) {
        // ignore — may already be unloaded
      }
    }
    try {
      fs.unlinkSync(PLIST_PATH);
    } catch (err) {
      // ignore — may already be absent
    }
  }
}

function isAutoLaunchEnabledMac() {
  return readExistingPlist() !== null;
}

/**
 * Removes the legacy login item ("Electron", registered by earlier versions
 * of this app via app.setLoginItemSettings) that's superseded by the
 * LaunchAgent above. Safe to call unconditionally: a no-op if openAtLogin
 * is already false.
 */
function cleanupLegacyLoginItem() {
  if (process.platform !== 'darwin') return;
  if (app.getLoginItemSettings().openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: false });
  }
}

/**
 * Enables/disables launching the app automatically on OS login.
 * - macOS: managed via a launchd LaunchAgent (see setAutoLaunchMac above).
 * - Windows: Electron's native API (Registry Run key), works reliably here
 *   since it's a direct process launch, not an app-bundle relaunch.
 * - Linux: not implemented by Electron at all; handled instead by the
 *   separate install.sh/uninstall.sh scripts (XDG autostart entry).
 */
function setAutoLaunch(enabled) {
  if (process.platform === 'darwin') {
    setAutoLaunchMac(enabled);
    return;
  }
  if (process.platform === 'linux') {
    return; // no-op: see install.sh/uninstall.sh
  }
  app.setLoginItemSettings({ openAtLogin: enabled });
}

function isAutoLaunchEnabled() {
  if (process.platform === 'darwin') {
    return isAutoLaunchEnabledMac();
  }
  if (process.platform === 'linux') {
    return false;
  }
  return app.getLoginItemSettings().openAtLogin;
}

module.exports = { setAutoLaunch, isAutoLaunchEnabled, cleanupLegacyLoginItem };
