'use strict';

const { app } = require('electron');
const path = require('path');

/**
 * Enables/disables launching the app automatically on OS login.
 * Uses Electron's cross-platform API (macOS, Windows). On Linux this
 * relies on the underlying desktop environment support via Electron.
 */
function setAutoLaunch(enabled) {
  if (process.platform === 'linux') {
    // app.setLoginItemSettings has limited support on Linux; Electron
    // still exposes the API but effectiveness depends on the desktop env.
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.env.NODE_ENV === 'development' ? process.execPath : undefined,
    args: process.env.NODE_ENV === 'development' ? [path.resolve(process.argv[1] || '.')] : [],
  });
}

function isAutoLaunchEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

module.exports = { setAutoLaunch, isAutoLaunchEnabled };
