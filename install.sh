#!/usr/bin/env bash
# Installs Pomodoro Timer as an auto-start entry, for Linux only
# (XDG autostart, ~/.config/autostart).
#
# macOS / Windows: Electron's setLoginItemSettings API natively supports
# both (macOS Login Items / Windows Registry Run key), so use the in-app
# "Start automatically on login" checkbox instead of this script. Using
# both a launchd job and the checkbox on macOS would start the app twice
# at login, so this script intentionally does not manage macOS anymore.

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Pomodoro Timer"

OS_NAME="$(uname -s)"

if [ "$OS_NAME" != "Linux" ]; then
  echo "This script only manages auto-start on Linux." >&2
  echo "On macOS/Windows, use the in-app \"Start automatically on login\" checkbox instead" >&2
  echo "(it uses the native OS login-item API, no script needed)." >&2
  exit 1
fi

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

autostart_dir="$HOME/.config/autostart"
desktop_path="$autostart_dir/pomodoro-timer.desktop"
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
echo "Done."
