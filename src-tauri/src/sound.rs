// Plays the alert sound via the OS-native
// player so it works regardless of window visibility/focus. Best-effort:
// silently no-ops if the file/player is unavailable.

use std::path::PathBuf;
use std::process::{Command, Stdio};

pub fn play_alert_sound(sound_path: PathBuf) {
    if !sound_path.exists() {
        return;
    }

    if cfg!(target_os = "macos") {
        let _ = Command::new("afplay")
            .arg(&sound_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    } else if cfg!(target_os = "windows") {
        let ps_command = format!("(New-Object Media.SoundPlayer '{}').PlaySync();", sound_path.display());
        let _ = Command::new("powershell")
            .args(["-c", &ps_command])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    } else {
        // Linux: try paplay, fall back to aplay.
        let paplay = Command::new("paplay")
            .arg(&sound_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        if paplay.is_err() {
            let _ = Command::new("aplay")
                .arg(&sound_path)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }
}
