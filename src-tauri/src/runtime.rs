// Shared helpers used both by command handlers (commands.rs) and the
// background tick/one-shot tasks (lib.rs): emitting frontend events,
// refreshing the tray icon/menu/tooltip, and playing the alert sound +
// native notification.

use crate::app_state::AppState;
use crate::timer::{Event, Settings, Snapshot};
use crate::tray_icon::render_tray_icon;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const TOMATO_PNG: &[u8] = include_bytes!("../../assets/icons/tray.png");
const ALERT_WAV: &[u8] = include_bytes!("../../assets/sounds/alert.wav");

const ACCENT_WORK: (u8, u8, u8) = (226, 87, 76);
const ACCENT_SHORT: (u8, u8, u8) = (63, 181, 98);
const ACCENT_LONG: (u8, u8, u8) = (59, 130, 196);

pub fn format_time(total_seconds: i64) -> String {
    let total_seconds = total_seconds.max(0);
    format!("{:02}:{:02}", total_seconds / 60, total_seconds % 60)
}

fn total_seconds_for_state(snapshot: &Snapshot, settings: &Settings) -> i64 {
    if snapshot.state == "break" {
        if snapshot.break_type == Some("long") {
            settings.long_break_seconds
        } else {
            settings.short_break_seconds
        }
    } else {
        settings.work_seconds
    }
}

/// Plays the alert sound via the OS-native player. Writes the embedded wav
/// bytes to a temp file once (idempotent) since the native players need a
/// file path, not stdin.
pub fn play_alert_sound() {
    let path = std::env::temp_dir().join("pomodoro-alert.wav");
    if !path.exists() {
        let _ = std::fs::write(&path, ALERT_WAV);
    }
    crate::sound::play_alert_sound(path);
}

/// Shows the main window, focuses it, and requests user attention
/// (dock bounce / taskbar flash).
pub fn show_and_attract_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Emits the frontend events + side effects (sound/notification/window
/// attention) implied by a Vec<Event> returned from a Timer method, then
/// refreshes the tray. Mirrors the per-event-type blocks in
/// wireTimerEvents() in main.js.
pub fn apply_events(app: &AppHandle, state: &AppState, events: Vec<Event>) {
    if events.is_empty() {
        return;
    }
    let snapshot = {
        let timer = state.timer.lock().unwrap();
        timer.snapshot()
    };

    for event in &events {
        match event {
            Event::Update => {
                let _ = app.emit("timer-update", &snapshot);
            }
            Event::Alert => {
                let _ = app.emit("timer-alert", &snapshot);
                play_alert_sound();
                notify(
                    app,
                    "Pomodoro",
                    &format!(
                        "Task \"{}\" finished! Snooze or Stop within 30s, or a break starts automatically.",
                        snapshot.task_label.as_deref().unwrap_or("")
                    ),
                );
                show_and_attract_window(app);
            }
            Event::BreakStart => {
                let _ = app.emit("timer-break-start", &snapshot);
                let label = if snapshot.break_type == Some("long") { "Long" } else { "Short" };
                notify(app, "Pomodoro", &format!("{label} break started ({}).", format_time(snapshot.remaining)));
            }
            Event::BreakEnd => {
                let _ = app.emit("timer-break-end", &snapshot);
                notify(app, "Pomodoro", "Break finished. Ready for the next task!");
            }
        }
    }

    update_tray_menu(app, &snapshot);
    update_tray_icon(app, state, &snapshot);
}

pub fn update_tray_menu(app: &AppHandle, snapshot: &Snapshot) {
    let Some(tray) = app.tray_by_id("main") else { return };

    let status_label = match snapshot.state {
        "running" => format!("Working: {} — {}", snapshot.task_label.as_deref().unwrap_or(""), format_time(snapshot.remaining)),
        "paused" => format!("Paused: {} — {}", snapshot.task_label.as_deref().unwrap_or(""), format_time(snapshot.remaining)),
        "alerting" => "Task finished — waiting for action".to_string(),
        "break" => {
            let label = if snapshot.break_type == Some("long") { "Long" } else { "Short" };
            format!("{label} break — {}", format_time(snapshot.remaining))
        }
        _ => "Idle".to_string(),
    };

    let _ = tray.set_tooltip(Some(format!("Pomodoro — {status_label}")));
    crate::tray_menu::rebuild_tray_menu(app, &tray, &status_label);
}

pub fn update_tray_icon(app: &AppHandle, state: &AppState, snapshot: &Snapshot) {
    let Some(tray) = app.tray_by_id("main") else { return };

    let show_ring = matches!(snapshot.state, "running" | "paused" | "break");
    let minutes_label = if show_ring { Some((snapshot.remaining as f64 / 60.0).ceil().max(0.0) as i64) } else { None };

    let key = if show_ring {
        format!("{}:{:?}:{:?}", snapshot.state, snapshot.break_type, minutes_label)
    } else {
        snapshot.state.to_string()
    };

    {
        let mut last_key = state.last_tray_icon_key.lock().unwrap();
        if last_key.as_deref() == Some(key.as_str()) {
            return;
        }
        *last_key = Some(key);
    }

    let settings = {
        let timer = state.timer.lock().unwrap();
        timer.get_settings()
    };
    let total = total_seconds_for_state(snapshot, &settings);
    let fraction = if show_ring && total > 0 { snapshot.remaining as f64 / total as f64 } else { 1.0 };
    let accent = match snapshot.state {
        "break" => {
            if snapshot.break_type == Some("long") {
                ACCENT_LONG
            } else {
                ACCENT_SHORT
            }
        }
        _ => ACCENT_WORK,
    };

    let rgba = render_tray_icon(fraction, accent, show_ring, TOMATO_PNG);
    let image = tauri::image::Image::new_owned(rgba, 128, 128);
    let _ = tray.set_icon(Some(image));

    #[cfg(target_os = "macos")]
    {
        let title = if show_ring { format!(" {}m", minutes_label.unwrap_or(0)) } else { String::new() };
        let _ = tray.set_title(Some(title));
    }
}
