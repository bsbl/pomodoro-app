'use strict';

const EventEmitter = require('events');

const WORK_SECONDS = 25 * 60;
const SHORT_BREAK_SECONDS = 5 * 60;
const LONG_BREAK_SECONDS = 15 * 60;
const SNOOZE_SECONDS = 60;
const ALERT_TIMEOUT_SECONDS = 30; // auto-trigger break if no click on Snooze/Stop
const SESSIONS_BEFORE_LONG_BREAK = 4;

/**
 * Pomodoro timer state machine.
 * States: idle -> running -> (paused <-> running) -> alerting -> break -> idle
 */
class PomodoroTimer extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle';
    this.taskLabel = null;
    this.remaining = 0;
    this.breakType = null; // 'short' | 'long'
    this.completedSessions = 0;
    this._interval = null;
  }

  getSnapshot() {
    return {
      state: this.state,
      taskLabel: this.taskLabel,
      remaining: this.remaining,
      breakType: this.breakType,
      completedSessions: this.completedSessions,
    };
  }

  _emitUpdate() {
    this.emit('update', this.getSnapshot());
  }

  _clearInterval() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _startInterval() {
    this._clearInterval();
    this._interval = setInterval(() => this._tick(), 1000);
  }

  _tick() {
    if (this.remaining > 0) {
      this.remaining -= 1;
      this._emitUpdate();
      return;
    }
    // remaining reached 0
    this._clearInterval();
    if (this.state === 'running') {
      this._enterAlerting();
    } else if (this.state === 'break') {
      this._endBreak();
    }
  }

  startTask(label) {
    this.taskLabel = label;
    this.state = 'running';
    this.remaining = WORK_SECONDS;
    this.breakType = null;
    this._startInterval();
    this._emitUpdate();
  }

  stopTask() {
    this._clearInterval();
    this.state = 'idle';
    this.taskLabel = null;
    this.remaining = 0;
    this.breakType = null;
    this._emitUpdate();
  }

  resetCurrent() {
    if (this.state !== 'running' && this.state !== 'paused') return;
    this.remaining = WORK_SECONDS;
    this.state = 'running';
    this._startInterval();
    this._emitUpdate();
  }

  pauseCurrent() {
    if (this.state !== 'running') return;
    this._clearInterval();
    this.state = 'paused';
    this._emitUpdate();
  }

  resumeCurrent() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this._startInterval();
    this._emitUpdate();
  }

  _enterAlerting() {
    this.state = 'alerting';
    this.completedSessions += 1;
    this._emitUpdate();
    this.emit('alert', this.getSnapshot());
    this._alertTimer = setTimeout(() => {
      this._startBreak();
    }, ALERT_TIMEOUT_SECONDS * 1000);
  }

  _clearAlertTimer() {
    if (this._alertTimer) {
      clearTimeout(this._alertTimer);
      this._alertTimer = null;
    }
  }

  snooze() {
    if (this.state !== 'alerting') return;
    this._clearAlertTimer();
    this.state = 'running';
    this.remaining = SNOOZE_SECONDS;
    this._startInterval();
    this._emitUpdate();
  }

  stopAlert() {
    if (this.state !== 'alerting') return;
    this._clearAlertTimer();
    this._startBreak();
  }

  _startBreak() {
    this._clearAlertTimer();
    const isLongBreak = this.completedSessions % SESSIONS_BEFORE_LONG_BREAK === 0;
    this.breakType = isLongBreak ? 'long' : 'short';
    this.remaining = isLongBreak ? LONG_BREAK_SECONDS : SHORT_BREAK_SECONDS;
    this.state = 'break';
    this._startInterval();
    this._emitUpdate();
    this.emit('break-start', this.getSnapshot());
  }

  _endBreak() {
    this.state = 'idle';
    this.breakType = null;
    this.taskLabel = null;
    this.remaining = 0;
    this._emitUpdate();
    this.emit('break-end', this.getSnapshot());
  }
}

module.exports = {
  PomodoroTimer,
  WORK_SECONDS,
  SHORT_BREAK_SECONDS,
  LONG_BREAK_SECONDS,
  SNOOZE_SECONDS,
  ALERT_TIMEOUT_SECONDS,
  SESSIONS_BEFORE_LONG_BREAK,
};
