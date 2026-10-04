'use strict';

const ALERT_AUTO_BREAK_SECONDS = 30; // must match main/timer.js ALERT_TIMEOUT_SECONDS
const POST_STOP_TIMEOUT_SECONDS = 30; // must match main/main.js POST_STOP_TIMEOUT_SECONDS

const timeDisplay = document.getElementById('time-display');
const stateLabel = document.getElementById('state-label');
const taskInput = document.getElementById('task-input');
const taskHistoryDatalist = document.getElementById('task-history');
const historyList = document.getElementById('history-list');
const autoLaunchCheckbox = document.getElementById('autolaunch-checkbox');

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnReset = document.getElementById('btn-reset');
const btnPauseResume = document.getElementById('btn-pause-resume');

const alertOverlay = document.getElementById('alert-overlay');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const overlayCountdown = document.getElementById('overlay-countdown');
const btnSnooze = document.getElementById('btn-snooze');
const btnStopAlert = document.getElementById('btn-stop-alert');

const postStopOverlay = document.getElementById('post-stop-overlay');
const postStopCountdown = document.getElementById('post-stop-countdown');
const btnPostStopBreak = document.getElementById('btn-post-stop-break');
const btnPostStopNewTask = document.getElementById('btn-post-stop-new-task');
const btnPostStopClose = document.getElementById('btn-post-stop-close');

const btnOpenSettings = document.getElementById('btn-open-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsError = document.getElementById('settings-error');
const inputWorkMinutes = document.getElementById('setting-work-minutes');
const inputShortBreakMinutes = document.getElementById('setting-short-break-minutes');
const inputLongBreakMinutes = document.getElementById('setting-long-break-minutes');
const inputSessionsBeforeLongBreak = document.getElementById('setting-sessions-before-long-break');
const btnSettingsSave = document.getElementById('btn-settings-save');
const btnSettingsCancel = document.getElementById('btn-settings-cancel');

let alertCountdownInterval = null;
let postStopCountdownInterval = null;
let currentState = 'idle';
let lastSettings = null;

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderHistory(history) {
  taskHistoryDatalist.innerHTML = '';
  historyList.innerHTML = '';
  history.forEach((label) => {
    const option = document.createElement('option');
    option.value = label;
    taskHistoryDatalist.appendChild(option);

    const li = document.createElement('li');
    li.textContent = label;
    li.addEventListener('click', () => {
      taskInput.value = label;
    });
    historyList.appendChild(li);
  });
}

function updateButtonsForState(state) {
  btnStart.disabled = state === 'running' || state === 'paused' || state === 'alerting' || state === 'break';
  btnStop.disabled = state === 'idle' || state === 'break';
  btnReset.disabled = state !== 'running' && state !== 'paused';
  btnPauseResume.disabled = state !== 'running' && state !== 'paused';
  btnPauseResume.textContent = state === 'paused' ? 'Resume current' : 'Pause current';
}

function applySnapshot(snapshot) {
  currentState = snapshot.state;
  // The idle state's remaining is always 0 (no task counting down); show
  // the configured task duration as a placeholder instead of "00:00".
  if (snapshot.state === 'idle' && lastSettings) {
    timeDisplay.textContent = formatTime(lastSettings.workMinutes * 60);
  } else {
    timeDisplay.textContent = formatTime(snapshot.remaining);
  }

  let label = 'Idle';
  if (snapshot.state === 'running') label = `Working: ${snapshot.taskLabel || ''}`;
  else if (snapshot.state === 'paused') label = `Paused: ${snapshot.taskLabel || ''}`;
  else if (snapshot.state === 'alerting') label = 'Task finished';
  else if (snapshot.state === 'break') label = snapshot.breakType === 'long' ? 'Long break' : 'Short break';
  stateLabel.textContent = label;

  updateButtonsForState(snapshot.state);

  if (snapshot.state !== 'alerting') {
    hideAlertOverlay();
  }
  if (snapshot.state !== 'idle') {
    hidePostStopOverlay();
  }
}

function showAlertOverlay(snapshot) {
  overlaySubtitle.textContent = `Task "${snapshot.taskLabel || ''}" is done.`;
  alertOverlay.classList.remove('hidden');

  let remaining = ALERT_AUTO_BREAK_SECONDS;
  overlayCountdown.textContent = `Break starts automatically in ${remaining}s if no action.`;
  clearInterval(alertCountdownInterval);
  alertCountdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(alertCountdownInterval);
      overlayCountdown.textContent = 'Starting break...';
      return;
    }
    overlayCountdown.textContent = `Break starts automatically in ${remaining}s if no action.`;
  }, 1000);
}

function hideAlertOverlay() {
  alertOverlay.classList.add('hidden');
  clearInterval(alertCountdownInterval);
  alertCountdownInterval = null;
}

function showPostStopOverlay() {
  postStopOverlay.classList.remove('hidden');

  let remaining = POST_STOP_TIMEOUT_SECONDS;
  postStopCountdown.textContent = `Break starts automatically in ${remaining}s if no action.`;
  clearInterval(postStopCountdownInterval);
  postStopCountdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(postStopCountdownInterval);
      postStopCountdown.textContent = 'Starting break...';
      return;
    }
    postStopCountdown.textContent = `Break starts automatically in ${remaining}s if no action.`;
  }, 1000);
}

function hidePostStopOverlay() {
  postStopOverlay.classList.add('hidden');
  clearInterval(postStopCountdownInterval);
  postStopCountdownInterval = null;
}

// The idle screen shows a placeholder time (next task's duration) rather
// than a live countdown. Refresh it whenever settings change/load so it
// doesn't keep showing a stale duration (e.g. "25:00" after switching to
// 30 minutes) until the user actually starts a task.
function refreshIdleTimeDisplay(settings) {
  lastSettings = settings;
  if (currentState !== 'idle') return;
  timeDisplay.textContent = formatTime(settings.workMinutes * 60);
}

function showSettingsOverlay() {
  settingsError.classList.add('hidden');
  settingsError.textContent = '';
  window.pomodoroAPI.getSettings().then((settings) => {
    inputWorkMinutes.value = settings.workMinutes;
    inputShortBreakMinutes.value = settings.shortBreakMinutes;
    inputLongBreakMinutes.value = settings.longBreakMinutes;
    inputSessionsBeforeLongBreak.value = settings.sessionsBeforeLongBreak;
    settingsOverlay.classList.remove('hidden');
  });
}

function hideSettingsOverlay() {
  settingsOverlay.classList.add('hidden');
}

// Wire up buttons
btnStart.addEventListener('click', () => {
  const label = taskInput.value.trim() || 'Untitled task';
  window.pomodoroAPI.startTask(label);
  window.pomodoroAPI.getHistory().then(renderHistory);
});
btnStop.addEventListener('click', () => {
  window.pomodoroAPI.stopTask();
  showPostStopOverlay();
});
btnReset.addEventListener('click', () => window.pomodoroAPI.resetCurrent());
btnPauseResume.addEventListener('click', () => {
  if (btnPauseResume.textContent === 'Resume current') {
    window.pomodoroAPI.resumeCurrent();
  } else {
    window.pomodoroAPI.pauseCurrent();
  }
});
btnSnooze.addEventListener('click', () => {
  window.pomodoroAPI.snooze();
  hideAlertOverlay();
});
btnStopAlert.addEventListener('click', () => {
  window.pomodoroAPI.stopAlert();
  hideAlertOverlay();
});
btnPostStopBreak.addEventListener('click', () => {
  window.pomodoroAPI.manualBreak();
  hidePostStopOverlay();
});
btnPostStopNewTask.addEventListener('click', () => {
  window.pomodoroAPI.dismissPostStop();
  hidePostStopOverlay();
  taskInput.focus();
});
btnPostStopClose.addEventListener('click', () => {
  window.pomodoroAPI.dismissPostStop();
  hidePostStopOverlay();
});

autoLaunchCheckbox.addEventListener('change', () => {
  window.pomodoroAPI.setAutoLaunch(autoLaunchCheckbox.checked);
});

btnOpenSettings.addEventListener('click', showSettingsOverlay);
window.pomodoroAPI.onOpenSettings(showSettingsOverlay);

btnSettingsCancel.addEventListener('click', hideSettingsOverlay);

btnSettingsSave.addEventListener('click', () => {
  const settings = {
    workMinutes: parseInt(inputWorkMinutes.value, 10),
    shortBreakMinutes: parseInt(inputShortBreakMinutes.value, 10),
    longBreakMinutes: parseInt(inputLongBreakMinutes.value, 10),
    sessionsBeforeLongBreak: parseInt(inputSessionsBeforeLongBreak.value, 10),
  };
  const isValid = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
  if (
    !isValid(settings.workMinutes, 180) ||
    !isValid(settings.shortBreakMinutes, 180) ||
    !isValid(settings.longBreakMinutes, 180) ||
    !isValid(settings.sessionsBeforeLongBreak, 20)
  ) {
    settingsError.textContent = 'Please enter whole numbers: 1-180 minutes, 1-20 tasks.';
    settingsError.classList.remove('hidden');
    return;
  }
  window.pomodoroAPI.setSettings(settings).then((result) => {
    if (!result || !result.ok) {
      settingsError.textContent = (result && result.error) || 'Could not save settings.';
      settingsError.classList.remove('hidden');
      return;
    }
    hideSettingsOverlay();
    refreshIdleTimeDisplay(settings);
  });
});

// Wire up main-process events
window.pomodoroAPI.onUpdate((snapshot) => {
  applySnapshot(snapshot);
  if (snapshot.state !== 'alerting') {
    // Refresh history in case a new task was just added.
  }
});
window.pomodoroAPI.onAlert((snapshot) => {
  applySnapshot(snapshot);
  showAlertOverlay(snapshot);
});
window.pomodoroAPI.onBreakStart((snapshot) => {
  applySnapshot(snapshot);
  hideAlertOverlay();
});
window.pomodoroAPI.onBreakEnd((snapshot) => {
  applySnapshot(snapshot);
  window.pomodoroAPI.getHistory().then(renderHistory);
});

// Initial load
window.pomodoroAPI.getHistory().then(renderHistory);
window.pomodoroAPI.getSettings().then(refreshIdleTimeDisplay);

window.pomodoroAPI.getAutoLaunch().then((enabled) => {
  autoLaunchCheckbox.checked = !!enabled;
});
updateButtonsForState('idle');
