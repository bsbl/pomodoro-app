#!/usr/bin/env bash
# Build launcher: installs Rust (if missing), OS-level Tauri build
# dependencies on Linux (if missing), npm dependencies, then produces the
# packaged Tauri app (.app/.dmg, .deb/.AppImage, .msi/.exe depending on the
# OS this is run on).
set -e
cd "$(dirname "$0")"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust/cargo introuvable : installation via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck source=/dev/null
source "$HOME/.cargo/env"

if [ "$(uname -s)" = "Linux" ] && command -v apt-get >/dev/null 2>&1; then
  if ! dpkg -s libwebkit2gtk-4.1-dev >/dev/null 2>&1; then
    echo "Dépendances système Linux manquantes (webkit2gtk, etc.) : installation via apt-get (sudo requis)..."
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential
  fi
fi

npm install
npm run tauri:build

echo
echo "Build terminé. Artefacts disponibles dans : target/release/bundle/"
