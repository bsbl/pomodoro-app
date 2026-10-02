// Port of src/main/data-dir.js: all app data lives in ~/.pomodoro,
// independent of Tauri's per-OS app-data directory.

use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::PathBuf;

pub fn app_data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("could not determine home directory")
        .join(".pomodoro")
}

pub fn ensure_data_dir() {
    let _ = fs::create_dir_all(app_data_dir());
}

pub fn read_json<T: DeserializeOwned>(path: &PathBuf, fallback: T) -> T {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

pub fn write_json<T: Serialize>(path: &PathBuf, data: &T) {
    ensure_data_dir();
    if let Ok(raw) = serde_json::to_string_pretty(data) {
        let _ = fs::write(path, raw);
    }
}
