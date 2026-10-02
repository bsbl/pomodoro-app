use crate::timer::Timer;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

pub struct AppState {
    pub timer: Mutex<Timer>,
    // Caches the last rendered tray icon's (state, breakType, minutes) key
    // so the tray only actually re-renders on minute boundaries or state
    // changes, not on every second-level tick (mirrors main.js).
    pub last_tray_icon_key: Mutex<Option<String>>,
    pub is_quitting: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            timer: Mutex::new(Timer::new()),
            last_tray_icon_key: Mutex::new(None),
            is_quitting: AtomicBool::new(false),
        }
    }
}
