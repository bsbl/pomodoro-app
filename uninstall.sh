#!/usr/bin/env bash
# Removes the Pomodoro Timer Linux auto-start entry installed by install.sh.
# Also best-effort removes a legacy macOS LaunchAgent from earlier versions
# of this script (install.sh no longer creates one on macOS).

set -euo pipefail

LABEL="com.sebastienbel.pomodoro-timer"
OS_NAME="$(uname -s)"

cleanup_legacy_macos_launchagent() {
  local plist_path="$HOME/Library/LaunchAgents/$LABEL.plist"
  if [ -f "$plist_path" ]; then
    local uid
    uid="$(id -u)"
    launchctl bootout "gui/$uid" "$plist_path" >/dev/null 2>&1 || true
    rm -f "$plist_path"
    echo "Removed legacy launchd agent from an earlier version: $plist_path"
  fi
  rm -f "/tmp/$LABEL.out.log" "/tmp/$LABEL.err.log"
}

uninstall_linux() {
  local desktop_path="$HOME/.config/autostart/pomodoro-timer.desktop"

  if [ -f "$desktop_path" ]; then
    rm -f "$desktop_path"
    echo "Removed autostart entry: $desktop_path"
  else
    echo "No autostart entry found at $desktop_path (nothing to do)."
  fi
}

case "$OS_NAME" in
  Darwin)
    cleanup_legacy_macos_launchagent
    echo "On macOS, auto-start is managed via the in-app \"Start automatically on login\" checkbox."
    echo "Uncheck it there to disable auto-start."
    ;;
  Linux)
    uninstall_linux
    ;;
  *)
    echo "Unsupported OS for this script: $OS_NAME" >&2
    echo "On Windows, uncheck \"Start automatically on login\" in the app instead." >&2
    exit 1
    ;;
esac

echo "Done."
