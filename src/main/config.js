'use strict';

const path = require('path');
const { APP_DATA_DIR, readJson, writeJson } = require('./data-dir');

const CONFIG_FILE = path.join(APP_DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  autoLaunch: false,
};

function loadConfig() {
  const data = readJson(CONFIG_FILE, {});
  return { ...DEFAULT_CONFIG, ...data };
}

function saveConfig(partialConfig) {
  const merged = { ...loadConfig(), ...partialConfig };
  writeJson(CONFIG_FILE, merged);
  return merged;
}

module.exports = { loadConfig, saveConfig, CONFIG_FILE };
