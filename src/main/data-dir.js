'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// All Pomodoro app data (config + task history) lives in ~/.pomodoro,
// independent of Electron's per-OS userData directory.
const APP_DATA_DIR = path.join(os.homedir(), '.pomodoro');

function ensureDataDir() {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { APP_DATA_DIR, ensureDataDir, readJson, writeJson };
