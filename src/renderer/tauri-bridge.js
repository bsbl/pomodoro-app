'use strict';

// Tauri equivalent of src/preload/preload.js: rebuilds window.pomodoroAPI on
// top of window.__TAURI__ (enabled via tauri.conf.json's withGlobalTauri)
// so that renderer.js itself requires no changes beyond the async
// getPlatform() call (Tauri commands are always invoked asynchronously,
// unlike the old preload's synchronous `platform` property).
(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  window.pomodoroAPI = {
    getPlatform: () => invoke('get_platform'),

    // Commands
    startTask: (label) => invoke('start_task', { label }),
    stopTask: () => invoke('stop_task'),
    resetCurrent: () => invoke('reset_current'),
    pauseCurrent: () => invoke('pause_current'),
    resumeCurrent: () => invoke('resume_current'),
    snooze: () => invoke('snooze'),
    stopAlert: () => invoke('stop_alert'),
    manualBreak: () => invoke('manual_break'),
    dismissPostStop: () => invoke('dismiss_post_stop'),
    getHistory: () => invoke('get_history'),
    getAutoLaunch: () => invoke('get_auto_launch'),
    setAutoLaunch: (enabled) => invoke('set_auto_launch', { enabled }),
    getSettings: () => invoke('get_settings'),
    setSettings: (settings) => invoke('set_settings', { settings }),

    // Events (main -> renderer)
    onUpdate: (callback) => {
      listen('timer-update', (event) => callback(event.payload));
    },
    onAlert: (callback) => {
      listen('timer-alert', (event) => callback(event.payload));
    },
    onBreakStart: (callback) => {
      listen('timer-break-start', (event) => callback(event.payload));
    },
    onBreakEnd: (callback) => {
      listen('timer-break-end', (event) => callback(event.payload));
    },
    onOpenSettings: (callback) => {
      listen('open-settings', () => callback());
    },
  };
})();
