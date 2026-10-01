'use strict';

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');

const { PomodoroTimer } = require('./timer');
const store = require('./store');
const { playAlertSound } = require('./sound');
const { setAutoLaunch, cleanupLegacyLoginItem } = require('./autostart');
const config = require('./config');
const { renderTrayIcon } = require('./tray-icon');

const ACCENT_COLORS = {
  work: '#e2574c',
  short: '#3fb562',
  long: '#3b82c4',
};

let mainWindow = null;
let tray = null;
const timer = new PomodoroTimer();

// Same value as timer.js's ALERT_TIMEOUT_SECONDS (kept separate since this
// timeout applies after a manual Stop, not the natural end-of-session alert).
const POST_STOP_TIMEOUT_SECONDS = 30;
let postStopTimeoutHandle = null;

function schedulePostStopTimeout() {
  clearPostStopTimeout();
  postStopTimeoutHandle = setTimeout(() => {
    postStopTimeoutHandle = null;
    timer.manualBreak();
  }, POST_STOP_TIMEOUT_SECONDS * 1000);
}

function clearPostStopTimeout() {
  if (postStopTimeoutHandle) {
    clearTimeout(postStopTimeoutHandle);
    postStopTimeoutHandle = null;
  }
}

// Prevent a second instance (e.g. manual launch while the OS login-item /
// autostart already started one, or a leftover process) from opening a
// duplicate window and running a second, conflicting timer.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    resizable: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'app.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Hide to tray instead of quitting when the window is closed.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    // Keep the colored tomato icon in the menu bar (not a monochrome
    // template image, so red/green stay visible like in the UI).
    icon = icon.resize({ width: 20, height: 20 });
  }
  tray = new Tray(icon);
  tray.setToolTip('Pomodoro Timer');
  updateTrayMenu();
  updateTrayIcon();
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

function updateTrayMenu(snapshot) {
  const s = snapshot || timer.getSnapshot();
  let statusLabel = 'Idle';
  if (s.state === 'running') statusLabel = `Working: ${s.taskLabel || ''} — ${formatTime(s.remaining)}`;
  else if (s.state === 'paused') statusLabel = `Paused: ${s.taskLabel || ''} — ${formatTime(s.remaining)}`;
  else if (s.state === 'alerting') statusLabel = 'Task finished — waiting for action';
  else if (s.state === 'break') statusLabel = `${s.breakType === 'long' ? 'Long' : 'Short'} break — ${formatTime(s.remaining)}`;

  const menu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => mainWindow.show() },
    {
      label: 'Settings…',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        sendToRenderer('open-settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Pomodoro — ${statusLabel}`);
}

// Tracks the last rendered minute value (and state) so updateTrayIcon only
// triggers an actual re-render on minute boundaries or state changes, not
// on every second-level timer tick.
let lastTrayIconKey = null;

function totalSecondsForState(s) {
  const settings = timer.getSettings();
  if (s.state === 'break') {
    return s.breakType === 'long' ? settings.longBreakSeconds : settings.shortBreakSeconds;
  }
  return settings.workSeconds;
}

// Applies the saved (or default) durations/session-count config to the
// timer. Called at startup, and again whenever the settings UI saves new
// values. Only affects the *next* task/break (see timer.configure()).
function applySettingsToTimer() {
  const c = config.loadConfig();
  timer.configure({
    workSeconds: c.workMinutes * 60,
    shortBreakSeconds: c.shortBreakMinutes * 60,
    longBreakSeconds: c.longBreakMinutes * 60,
    sessionsBeforeLongBreak: c.sessionsBeforeLongBreak,
  });
}

function updateTrayIcon(snapshot) {
  const s = snapshot || timer.getSnapshot();
  const showRing = s.state === 'running' || s.state === 'paused' || s.state === 'break';
  const minutesLabel = showRing ? Math.max(0, Math.ceil(s.remaining / 60)) : null;

  const key = showRing ? `${s.state}:${s.breakType}:${minutesLabel}` : s.state;
  if (key === lastTrayIconKey) return;
  lastTrayIconKey = key;

  const fraction = showRing ? s.remaining / totalSecondsForState(s) : 1;
  const accentColor = s.state === 'break' ? ACCENT_COLORS[s.breakType === 'long' ? 'long' : 'short'] : ACCENT_COLORS.work;

  renderTrayIcon({ fraction, accentColor, showRing })
    .then((image) => {
      // Match the sizing already applied to the static tray icon in
      // createTray() (20x20 on macOS; left at native size elsewhere).
      if (process.platform === 'darwin') {
        image = image.resize({ width: 20, height: 20 });
      }
      if (tray && !tray.isDestroyed()) tray.setImage(image);
    })
    .catch(() => {
      // Best-effort: keep the previous icon if rendering fails for any reason.
    });

  if (process.platform === 'darwin') {
    // Tray.setTitle (text next to the menu bar icon) is only supported on
    // macOS; Windows/Linux tray icons are icon-only (tooltip covers text
    // there, see updateTrayMenu above).
    tray.setTitle(showRing ? ` ${minutesLabel}m` : '');
  }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function wireTimerEvents() {
  timer.on('update', (snapshot) => {
    sendToRenderer('timer-update', snapshot);
    updateTrayMenu(snapshot);
    updateTrayIcon(snapshot);
  });

  timer.on('alert', (snapshot) => {
    sendToRenderer('timer-alert', snapshot);
    updateTrayIcon(snapshot);
    playAlertSound();
    if (Notification.isSupported()) {
      new Notification({
        title: 'Pomodoro',
        body: `Task "${snapshot.taskLabel || ''}" finished! Snooze or Stop within 30s, or a break starts automatically.`,
      }).show();
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.flashFrame(true);
    }
  });

  timer.on('break-start', (snapshot) => {
    sendToRenderer('timer-break-start', snapshot);
    updateTrayIcon(snapshot);
    if (mainWindow) mainWindow.flashFrame(false);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Pomodoro',
        body: `${snapshot.breakType === 'long' ? 'Long' : 'Short'} break started (${formatTime(snapshot.remaining)}).`,
      }).show();
    }
  });

  timer.on('break-end', (snapshot) => {
    sendToRenderer('timer-break-end', snapshot);
    updateTrayIcon(snapshot);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Pomodoro',
        body: 'Break finished. Ready for the next task!',
      }).show();
    }
  });
}

function wireIpc() {
  ipcMain.on('start-task', (_event, label) => {
    clearPostStopTimeout();
    store.addTask(label);
    timer.startTask(label);
  });
  ipcMain.on('stop-task', () => {
    timer.stopTask();
    schedulePostStopTimeout();
  });
  ipcMain.on('reset-current', () => timer.resetCurrent());
  ipcMain.on('pause-current', () => timer.pauseCurrent());
  ipcMain.on('resume-current', () => timer.resumeCurrent());
  ipcMain.on('snooze', () => timer.snooze());
  ipcMain.on('stop-alert', () => timer.stopAlert());
  ipcMain.on('manual-break', () => {
    clearPostStopTimeout();
    timer.manualBreak();
  });
  ipcMain.on('dismiss-post-stop', () => clearPostStopTimeout());
  ipcMain.handle('get-history', () => store.loadHistory());
  ipcMain.handle('get-auto-launch', () => config.loadConfig().autoLaunch);
  ipcMain.on('set-auto-launch', (_event, enabled) => {
    setAutoLaunch(enabled);
    config.saveConfig({ autoLaunch: enabled });
  });
  ipcMain.handle('get-settings', () => {
    const c = config.loadConfig();
    return {
      workMinutes: c.workMinutes,
      shortBreakMinutes: c.shortBreakMinutes,
      longBreakMinutes: c.longBreakMinutes,
      sessionsBeforeLongBreak: c.sessionsBeforeLongBreak,
    };
  });
  ipcMain.handle('set-settings', (_event, settings) => {
    const sanitized = sanitizeSettings(settings);
    if (!sanitized) return { ok: false, error: 'Invalid settings: all fields must be positive whole numbers.' };
    config.saveConfig(sanitized);
    applySettingsToTimer();
    return { ok: true };
  });
}

// Whole numbers only, within sane bounds (1-180 minutes, 1-20 sessions) —
// matches the <input type="number" min max step="1"> constraints in the
// settings UI, re-checked here since IPC input can't be trusted as-is.
function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const isValid = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
  const { workMinutes, shortBreakMinutes, longBreakMinutes, sessionsBeforeLongBreak } = raw;
  if (
    !isValid(workMinutes, 180) ||
    !isValid(shortBreakMinutes, 180) ||
    !isValid(longBreakMinutes, 180) ||
    !isValid(sessionsBeforeLongBreak, 20)
  ) {
    return null;
  }
  return { workMinutes, shortBreakMinutes, longBreakMinutes, sessionsBeforeLongBreak };
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    // In dev mode (unpackaged `electron .`), the Dock shows the generic
    // Electron icon unless we set it explicitly. Packaged builds would use
    // the icon baked into the app bundle instead.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(path.join(__dirname, '..', '..', 'assets', 'icons', 'app.png'));
    }

    applySettingsToTimer();
    createWindow();
    createTray();
    wireTimerEvents();
    wireIpc();

    // Re-apply the saved auto-launch preference at startup, so ~/.pomodoro/config.json
    // stays the source of truth (useful notably on Linux, where the OS-native
    // login-item API used by autostart.js is not available).
    // On macOS, also clear out any leftover legacy login item from earlier
    // versions of this app (before the switch to a launchd LaunchAgent).
    cleanupLegacyLoginItem();
    const savedConfig = config.loadConfig();
    setAutoLaunch(savedConfig.autoLaunch);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow.show();
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // Keep running in tray on all platforms; user quits via tray menu.
  });
}
