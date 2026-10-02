// Tauri commands invoked from the frontend via `invoke(...)`. Mirrors the
// ipcMain.on/handle wiring in src/main/main.js.

use crate::app_state::AppState;
use crate::config;
use crate::runtime::apply_events;
use crate::store;
use crate::timer::{POST_STOP_TIMEOUT_SECONDS, ALERT_TIMEOUT_SECONDS};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn start_task(app: AppHandle, state: State<'_, AppState>, label: String) {
    store::add_task(&label);
    let events = {
        let mut timer = state.timer.lock().unwrap();
        timer.start_task(label)
    };
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn stop_task(app: AppHandle, state: State<'_, AppState>) {
    let (events, token) = {
        let mut timer = state.timer.lock().unwrap();
        timer.stop_task()
    };
    apply_events(&app, &state, events);
    schedule_post_stop_timeout(app, token);
}

#[tauri::command]
pub fn reset_current(app: AppHandle, state: State<'_, AppState>) {
    let events = state.timer.lock().unwrap().reset_current();
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn pause_current(app: AppHandle, state: State<'_, AppState>) {
    let events = state.timer.lock().unwrap().pause_current();
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn resume_current(app: AppHandle, state: State<'_, AppState>) {
    let events = state.timer.lock().unwrap().resume_current();
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn snooze(app: AppHandle, state: State<'_, AppState>) {
    let events = state.timer.lock().unwrap().snooze();
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn stop_alert(app: AppHandle, state: State<'_, AppState>) {
    let events = state.timer.lock().unwrap().stop_alert();
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn manual_break(app: AppHandle, state: State<'_, AppState>) {
    let events = state.timer.lock().unwrap().manual_break();
    apply_events(&app, &state, events);
}

#[tauri::command]
pub fn dismiss_post_stop(state: State<'_, AppState>) {
    state.timer.lock().unwrap().dismiss_post_stop();
}

#[tauri::command]
pub fn get_history() -> Vec<String> {
    store::load_history()
}

#[tauri::command]
pub fn get_auto_launch() -> bool {
    config::load_config().auto_launch
}

#[tauri::command]
pub fn set_auto_launch(app: AppHandle, enabled: bool) {
    let result = if enabled { app.autolaunch().enable() } else { app.autolaunch().disable() };
    if let Err(err) = result {
        log::warn!("failed to update auto-launch registration: {err}");
    }
    let mut c = config::load_config();
    c.auto_launch = enabled;
    config::save_config(&c);
}

#[derive(serde::Serialize)]
pub struct SettingsPayload {
    #[serde(rename = "workMinutes")]
    work_minutes: u32,
    #[serde(rename = "shortBreakMinutes")]
    short_break_minutes: u32,
    #[serde(rename = "longBreakMinutes")]
    long_break_minutes: u32,
    #[serde(rename = "sessionsBeforeLongBreak")]
    sessions_before_long_break: u32,
}

#[tauri::command]
pub fn get_settings() -> SettingsPayload {
    let c = config::load_config();
    SettingsPayload {
        work_minutes: c.work_minutes,
        short_break_minutes: c.short_break_minutes,
        long_break_minutes: c.long_break_minutes,
        sessions_before_long_break: c.sessions_before_long_break,
    }
}

#[derive(serde::Deserialize)]
pub struct SettingsInput {
    #[serde(rename = "workMinutes")]
    work_minutes: i64,
    #[serde(rename = "shortBreakMinutes")]
    short_break_minutes: i64,
    #[serde(rename = "longBreakMinutes")]
    long_break_minutes: i64,
    #[serde(rename = "sessionsBeforeLongBreak")]
    sessions_before_long_break: i64,
}

#[derive(serde::Serialize)]
pub struct SetSettingsResult {
    ok: bool,
    error: Option<String>,
}

// Whole numbers only, within sane bounds (1-180 minutes, 1-20 sessions) —
// matches the <input type="number" min max step="1"> constraints in the
// settings UI, re-checked here since IPC input can't be trusted as-is.
fn sanitize_settings(raw: &SettingsInput) -> Option<(u32, u32, u32, u32)> {
    let is_valid = |n: i64, max: i64| n >= 1 && n <= max;
    if !is_valid(raw.work_minutes, 180)
        || !is_valid(raw.short_break_minutes, 180)
        || !is_valid(raw.long_break_minutes, 180)
        || !is_valid(raw.sessions_before_long_break, 20)
    {
        return None;
    }
    Some((
        raw.work_minutes as u32,
        raw.short_break_minutes as u32,
        raw.long_break_minutes as u32,
        raw.sessions_before_long_break as u32,
    ))
}

#[tauri::command]
pub fn set_settings(state: State<'_, AppState>, settings: SettingsInput) -> SetSettingsResult {
    let Some((work_minutes, short_break_minutes, long_break_minutes, sessions_before_long_break)) =
        sanitize_settings(&settings)
    else {
        return SetSettingsResult {
            ok: false,
            error: Some("Invalid settings: all fields must be positive whole numbers.".to_string()),
        };
    };

    let mut c = config::load_config();
    c.work_minutes = work_minutes;
    c.short_break_minutes = short_break_minutes;
    c.long_break_minutes = long_break_minutes;
    c.sessions_before_long_break = sessions_before_long_break;
    config::save_config(&c);

    crate::apply_settings_to_timer(state.inner(), &c);

    SetSettingsResult { ok: true, error: None }
}

#[tauri::command]
pub fn get_platform() -> &'static str {
    std::env::consts::OS // "macos" | "windows" | "linux"
}

/// Schedules the 30s post-Stop auto-break timeout. Only acts if
/// `post_stop_token` still matches when it wakes (i.e. nothing cancelled
/// or superseded it — see timer.rs's token doc comment).
fn schedule_post_stop_timeout(app: AppHandle, token: u64) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(POST_STOP_TIMEOUT_SECONDS)).await;
        let state = app.state::<AppState>();
        let events = {
            let mut timer = state.timer.lock().unwrap();
            if timer.post_stop_token == Some(token) {
                timer.manual_break()
            } else {
                vec![]
            }
        };
        apply_events(&app, &state, events);
    });
}

/// Schedules the 30s alert auto-break timeout, mirroring the above. Called
/// from the background tick loop (lib.rs) when tick() transitions into
/// Alerting.
pub fn schedule_alert_timeout(app: AppHandle, token: u64) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(ALERT_TIMEOUT_SECONDS)).await;
        let state = app.state::<AppState>();
        let events = {
            let mut timer = state.timer.lock().unwrap();
            if timer.alert_token == Some(token) {
                timer.stop_alert()
            } else {
                vec![]
            }
        };
        apply_events(&app, &state, events);
    });
}
