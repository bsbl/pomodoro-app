#!/usr/bin/env bash
# Installs Pomodoro Timer as an auto-start service for the current user.
#   macOS -> launchd LaunchAgent (~/Library/LaunchAgents)
#   Linux -> XDG autostart entry (~/.config/autostart)
#
# Windows: not covered by this script (bash). Use the in-app
# "Start automatically on login" checkbox instead (uses the Windows
# Registry Run key via Electron's native API).

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Pomodoro Timer"
LABEL="com.sebastienbel.pomodoro-timer"

echo "Pomodoro Timer install directory: $APP_DIR"

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "Dependencies not found, running npm install..."
  (cd "$APP_DIR" && npm install)
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Error: 'node' was not found in PATH. Install Node.js and re-run this script." >&2
  exit 1
fi

ELECTRON_CLI="$APP_DIR/node_modules/electron/cli.js"
if [ ! -f "$ELECTRON_CLI" ]; then
  echo "Error: Electron is not installed correctly (missing $ELECTRON_CLI)." >&2
  echo "Run 'npm install' in $APP_DIR and try again." >&2
  exit 1
fi

OS_NAME="$(uname -s)"

install_macos() {
  local plist_dir="$HOME/Library/LaunchAgents"
  local plist_path="$plist_dir/$LABEL.plist"
  mkdir -p "$plist_dir"

  cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$ELECTRON_CLI</string>
    <string>$APP_DIR</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>/tmp/$LABEL.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/$LABEL.err.log</string>
</dict>
</plist>
PLIST

  echo "Created launchd agent: $plist_path"

  local uid
  uid="$(id -u)"
  launchctl bootout "gui/$uid" "$plist_path" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$uid" "$plist_path"
  echo "Service loaded. It will start automatically at next login."
  echo "To start it right now: launchctl kickstart -k gui/$uid/$LABEL"
}

install_linux() {
  local autostart_dir="$HOME/.config/autostart"
  local desktop_path="$autostart_dir/pomodoro-timer.desktop"
  mkdir -p "$autostart_dir"

  cat > "$desktop_path" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Pomodoro focus timer
Exec="$NODE_BIN" "$ELECTRON_CLI" "$APP_DIR"
Path=$APP_DIR
Icon=$APP_DIR/assets/icons/app.png
Terminal=false
X-GNOME-Autostart-enabled=true
NoDisplay=false
DESKTOP

  echo "Created autostart entry: $desktop_path"
  echo "It will start automatically at your next graphical login."
  echo "To start it right now: \"$NODE_BIN\" \"$ELECTRON_CLI\" \"$APP_DIR\" &"
}

case "$OS_NAME" in
  Darwin)
    install_macos
    ;;
  Linux)
    install_linux
    ;;
  *)
    echo "Unsupported OS for this script: $OS_NAME" >&2
    echo "On Windows, use the in-app \"Start automatically on login\" checkbox instead." >&2
    exit 1
    ;;
esac

echo "Done."
