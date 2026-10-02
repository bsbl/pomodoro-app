// Builds/rebuilds the tray context menu. Separate module because Tauri
// menus are immutable once built (unlike Electron's Menu.buildFromTemplate
// which can be re-applied freely) — rebuild_tray_menu constructs a fresh
// Menu every time the status label needs to change and calls
// tray.set_menu(...).

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Manager};

pub fn rebuild_tray_menu(app: &AppHandle, tray: &TrayIcon, status_label: &str) {
    let status_item = MenuItemBuilder::with_id("status", status_label).enabled(false).build(app);
    let show_item = MenuItemBuilder::with_id("show", "Show window").build(app);
    let settings_item = MenuItemBuilder::with_id("settings", "Settings…").build(app);
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app);

    let (Ok(status_item), Ok(show_item), Ok(settings_item), Ok(quit_item)) =
        (status_item, show_item, settings_item, quit_item)
    else {
        return;
    };

    let Ok(menu) = MenuBuilder::new(app)
        .item(&status_item)
        .item(&PredefinedMenuItem::separator(app).unwrap())
        .item(&show_item)
        .item(&settings_item)
        .item(&PredefinedMenuItem::separator(app).unwrap())
        .item(&quit_item)
        .build()
    else {
        return;
    };

    let _ = tray.set_menu(Some(menu));
}

/// Handles clicks on the tray menu items built above. Registered once via
/// `TrayIconBuilder::on_menu_event` in lib.rs.
pub fn handle_tray_menu_event(app: &AppHandle, event_id: &str) {
    match event_id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "settings" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = tauri::Emitter::emit(app, "open-settings", ());
            }
        }
        "quit" => {
            if let Some(state) = app.try_state::<crate::app_state::AppState>() {
                state.is_quitting.store(true, std::sync::atomic::Ordering::SeqCst);
            }
            app.exit(0);
        }
        _ => {}
    }
}
