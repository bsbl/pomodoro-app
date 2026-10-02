mod app_state;
mod commands;
mod config;
mod data_dir;
mod runtime;
mod sound;
mod store;
mod timer;
mod tray_icon;
mod tray_menu;

use app_state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Applies the saved (or default) durations/session-count config to the
/// timer. Called at startup, and again whenever the settings UI saves new
/// values. Only affects the *next* task/break (see Timer::configure()).
pub fn apply_settings_to_timer(state: &AppState, c: &config::Config) {
    let mut timer = state.timer.lock().unwrap();
    timer.configure(
        Some(c.work_minutes as i64 * 60),
        Some(c.short_break_minutes as i64 * 60),
        Some(c.long_break_minutes as i64 * 60),
        Some(c.sessions_before_long_break),
    );
}

/// Background 1s ticker: advances the timer every second regardless of
/// state (no-ops unless Running/Break), emitting events/refreshing the
/// tray exactly like the JS `setInterval(() => this._tick(), 1000)` did.
fn start_ticker(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;
            let state = app.state::<AppState>();
            let tick_result = { state.timer.lock().unwrap().tick() };
            let Some((events, new_alert_token)) = tick_result else { continue };
            runtime::apply_events(&app, &state, events);
            if let Some(token) = new_alert_token {
                commands::schedule_alert_timeout(app.clone(), token);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(if cfg!(debug_assertions) {
            tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build()
        } else {
            tauri_plugin_log::Builder::default().level(log::LevelFilter::Warn).build()
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_task,
            commands::stop_task,
            commands::reset_current,
            commands::pause_current,
            commands::resume_current,
            commands::snooze,
            commands::stop_alert,
            commands::manual_break,
            commands::dismiss_post_stop,
            commands::get_history,
            commands::get_auto_launch,
            commands::set_auto_launch,
            commands::get_settings,
            commands::set_settings,
            commands::get_platform,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            {
                let state = app.state::<AppState>();
                let c = config::load_config();
                apply_settings_to_timer(state.inner(), &c);

                // Re-apply the saved auto-launch preference at startup, so
                // ~/.pomodoro/config.json stays the source of truth (e.g.
                // after the plugin's underlying OS mechanism is reset
                // externally).
                let auto_launch_result =
                    if c.auto_launch { handle.autolaunch().enable() } else { handle.autolaunch().disable() };
                if let Err(err) = auto_launch_result {
                    log::warn!("failed to apply saved auto-launch setting at startup: {err}");
                }
            }

            let tray = tauri::tray::TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("Pomodoro Timer")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    tray_menu::handle_tray_menu_event(app, event.id().as_ref());
                })
                .build(app)?;
            let _ = tray;

            {
                let state = app.state::<AppState>();
                let snapshot = state.timer.lock().unwrap().snapshot();
                runtime::update_tray_menu(&handle, &snapshot);
                runtime::update_tray_icon(&handle, state.inner(), &snapshot);
            }

            // Hide to tray instead of quitting when the window is closed.
            if let Some(window) = app.get_webview_window("main") {
                let handle_for_close = handle.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let state = handle_for_close.state::<AppState>();
                        if !state.is_quitting.load(Ordering::SeqCst) {
                            api.prevent_close();
                            if let Some(w) = handle_for_close.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    }
                });
            }

            start_ticker(handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
