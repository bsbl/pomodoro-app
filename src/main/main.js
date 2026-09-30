'use strict';

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');

const { PomodoroTimer } = require('./timer');
const store = require('./store');
const { playAlertSound } = require('./sound');
const { setAutoLaunch } = require('./autostart');
const config = require('./config');

let mainWindow = null;
let tray = null;
const timer = new PomodoroTimer();

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

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function wireTimerEvents() {
  timer.on('update', (snapshot) => {
    sendToRenderer('timer-update', snapshot);
    updateTrayMenu(snapshot);
  });

  timer.on('alert', (snapshot) => {
    sendToRenderer('timer-alert', snapshot);
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
    store.addTask(label);
    timer.startTask(label);
  });
  ipcMain.on('stop-task', () => timer.stopTask());
  ipcMain.on('reset-current', () => timer.resetCurrent());
  ipcMain.on('pause-current', () => timer.pauseCurrent());
  ipcMain.on('resume-current', () => timer.resumeCurrent());
  ipcMain.on('snooze', () => timer.snooze());
  ipcMain.on('stop-alert', () => timer.stopAlert());
  ipcMain.handle('get-history', () => store.loadHistory());
  ipcMain.handle('get-auto-launch', () => config.loadConfig().autoLaunch);
  ipcMain.on('set-auto-launch', (_event, enabled) => {
    setAutoLaunch(enabled);
    config.saveConfig({ autoLaunch: enabled });
  });
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    // In dev mode (unpackaged `electron .`), the Dock shows the generic
    // Electron icon unless we set it explicitly. Packaged builds would use
    // the icon baked into the app bundle instead.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(path.join(__dirname, '..', '..', 'assets', 'icons', 'app.png'));
    }

    createWindow();
    createTray();
    wireTimerEvents();
    wireIpc();

    // Re-apply the saved auto-launch preference at startup, so ~/.pomodoro/config.json
    // stays the source of truth (useful notably on Linux, where the OS-native
    // login-item API used by autostart.js is not available).
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
