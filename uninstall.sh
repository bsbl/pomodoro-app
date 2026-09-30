#!/usr/bin/env bash
# Removes the Pomodoro Timer auto-start service installed by install.sh.
#   macOS -> unloads and removes the launchd LaunchAgent
#   Linux -> removes the XDG autostart entry

set -euo pipefail

LABEL="com.sebastienbel.pomodoro-timer"
OS_NAME="$(uname -s)"

uninstall_macos() {
  local plist_path="$HOME/Library/LaunchAgents/$LABEL.plist"
  local uid
  uid="$(id -u)"

  if [ -f "$plist_path" ]; then
    launchctl bootout "gui/$uid" "$plist_path" >/dev/null 2>&1 || true
    rm -f "$plist_path"
    echo "Removed launchd agent: $plist_path"
  else
    echo "No launchd agent found at $plist_path (nothing to do)."
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
    uninstall_macos
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

echo "Auto-start service removed. The app itself is untouched (only the auto-start entry was removed)."
