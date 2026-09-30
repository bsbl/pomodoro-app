'use strict';

const ALERT_AUTO_BREAK_SECONDS = 30; // must match main/timer.js ALERT_TIMEOUT_SECONDS

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

let alertCountdownInterval = null;

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
  timeDisplay.textContent = formatTime(snapshot.remaining);

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

// Wire up buttons
btnStart.addEventListener('click', () => {
  const label = taskInput.value.trim() || 'Untitled task';
  window.pomodoroAPI.startTask(label);
  window.pomodoroAPI.getHistory().then(renderHistory);
});
btnStop.addEventListener('click', () => window.pomodoroAPI.stopTask());
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

autoLaunchCheckbox.addEventListener('change', () => {
  window.pomodoroAPI.setAutoLaunch(autoLaunchCheckbox.checked);
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
window.pomodoroAPI.getAutoLaunch().then((enabled) => {
  autoLaunchCheckbox.checked = !!enabled;
});
updateButtonsForState('idle');
