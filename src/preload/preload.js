'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoroAPI', {
  // Read-only platform info ('darwin' | 'win32' | 'linux'), used to adapt
  // the UI (e.g. auto-start checkbox is only functional on macOS/Windows).
  platform: process.platform,

  // Commands
  startTask: (label) => ipcRenderer.send('start-task', label),
  stopTask: () => ipcRenderer.send('stop-task'),
  resetCurrent: () => ipcRenderer.send('reset-current'),
  pauseCurrent: () => ipcRenderer.send('pause-current'),
  resumeCurrent: () => ipcRenderer.send('resume-current'),
  snooze: () => ipcRenderer.send('snooze'),
  stopAlert: () => ipcRenderer.send('stop-alert'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.send('set-auto-launch', enabled),

  // Events (main -> renderer)
  onUpdate: (callback) => {
    ipcRenderer.on('timer-update', (_event, snapshot) => callback(snapshot));
  },
  onAlert: (callback) => {
    ipcRenderer.on('timer-alert', (_event, snapshot) => callback(snapshot));
  },
  onBreakStart: (callback) => {
    ipcRenderer.on('timer-break-start', (_event, snapshot) => callback(snapshot));
  },
  onBreakEnd: (callback) => {
    ipcRenderer.on('timer-break-end', (_event, snapshot) => callback(snapshot));
  },
});
