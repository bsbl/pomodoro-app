// Port of src/main/config.js.

use crate::data_dir::{app_data_dir, read_json, write_json};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy)]
pub struct Config {
    #[serde(rename = "autoLaunch")]
    pub auto_launch: bool,
    #[serde(rename = "workMinutes")]
    pub work_minutes: u32,
    #[serde(rename = "shortBreakMinutes")]
    pub short_break_minutes: u32,
    #[serde(rename = "longBreakMinutes")]
    pub long_break_minutes: u32,
    #[serde(rename = "sessionsBeforeLongBreak")]
    pub sessions_before_long_break: u32,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            auto_launch: false,
            work_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            sessions_before_long_break: 4,
        }
    }
}

fn config_path() -> std::path::PathBuf {
    app_data_dir().join("config.json")
}

pub fn load_config() -> Config {
    read_json(&config_path(), Config::default())
}

pub fn save_config(config: &Config) {
    write_json(&config_path(), config);
}
