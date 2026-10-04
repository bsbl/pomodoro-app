// Task history persistence.

use crate::data_dir::{app_data_dir, read_json, write_json};

const MAX_HISTORY: usize = 50;

fn history_path() -> std::path::PathBuf {
    app_data_dir().join("history.json")
}

pub fn load_history() -> Vec<String> {
    read_json(&history_path(), Vec::new())
}

fn save_history(history: &Vec<String>) {
    write_json(&history_path(), history);
}

/// Adds a task label to the history (most recent first, deduplicated).
pub fn add_task(label: &str) -> Vec<String> {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return load_history();
    }
    let mut history: Vec<String> = load_history().into_iter().filter(|t| t != trimmed).collect();
    history.insert(0, trimmed.to_string());
    history.truncate(MAX_HISTORY);
    save_history(&history);
    history
}
