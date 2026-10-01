'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

const ICON_PAGE = path.join(__dirname, '..', 'renderer', 'tray-icon.html');
const SIZE = 128;

let hiddenWindow = null;
let readyPromise = null;

// Lazily creates (once) a hidden BrowserWindow used purely as a canvas
// renderer: it loads tray-icon.html and we call its exposed renderIcon()
// function, then capturePage() to get a nativeImage out of it. Reused
// across calls instead of recreated, to avoid the overhead/flicker of
// spawning a new renderer process on every icon update.
function getHiddenWindow() {
  if (hiddenWindow && !hiddenWindow.isDestroyed()) {
    return { win: hiddenWindow, ready: readyPromise };
  }
  hiddenWindow = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  readyPromise = hiddenWindow.loadFile(ICON_PAGE);
  hiddenWindow.on('closed', () => {
    hiddenWindow = null;
    readyPromise = null;
  });
  return { win: hiddenWindow, ready: readyPromise };
}

let renderQueue = Promise.resolve();

/**
 * Renders the tray icon (tomato + optional progress ring) and returns a
 * nativeImage. fraction is remaining/total in [0, 1] (1 = full ring, just
 * started; 0 = empty, about to end). accentColor is a CSS color string.
 * showRing=false draws the plain tomato (used for idle/alerting states).
 *
 * Calls are serialized (one at a time) to avoid overlapping
 * executeJavaScript/capturePage calls on the shared hidden window if
 * updateTrayIcon() were ever invoked faster than a render completes.
 */
function renderTrayIcon({ fraction = 1, accentColor = '#e2574c', showRing = true } = {}) {
  renderQueue = renderQueue.then(async () => {
    const { win, ready } = getHiddenWindow();
    await ready;
    await win.webContents.executeJavaScript(
      `window.renderIcon(${JSON.stringify(fraction)}, ${JSON.stringify(accentColor)}, ${JSON.stringify(showRing)})`
    );
    // capturePage() can grab a frame from just before the canvas draw above
    // actually gets composited (observed on hidden windows). Wait one extra
    // animation frame inside the page, then a tiny timer tick in the main
    // process, before capturing.
    await win.webContents.executeJavaScript(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    );
    const image = await win.webContents.capturePage();
    return image;
  });
  return renderQueue;
}

module.exports = { renderTrayIcon };
