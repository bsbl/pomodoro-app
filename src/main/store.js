'use strict';

const path = require('path');
const { APP_DATA_DIR, readJson, writeJson } = require('./data-dir');

const HISTORY_FILE = path.join(APP_DATA_DIR, 'history.json');
const MAX_HISTORY = 50;

function loadHistory() {
  const data = readJson(HISTORY_FILE, []);
  return Array.isArray(data) ? data : [];
}

function saveHistory(history) {
  writeJson(HISTORY_FILE, history);
}

/**
 * Adds a task label to the history (most recent first, deduplicated).
 */
function addTask(label) {
  const trimmed = (label || '').trim();
  if (!trimmed) return loadHistory();
  const history = loadHistory().filter((t) => t !== trimmed);
  history.unshift(trimmed);
  const truncated = history.slice(0, MAX_HISTORY);
  saveHistory(truncated);
  return truncated;
}

module.exports = { loadHistory, addTask, HISTORY_FILE };
