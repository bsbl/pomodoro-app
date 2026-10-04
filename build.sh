#!/usr/bin/env bash
# Build launcher: installs/upgrades the whole toolchain if needed (see
# scripts/ensure-toolchain.sh), then produces the packaged Tauri app
# (.app/.dmg, .deb/.AppImage, .msi/.exe depending on the OS).
set -e
cd "$(dirname "$0")"
source scripts/ensure-toolchain.sh
npm run tauri:build

echo
echo "Build terminé. Artefacts disponibles dans : target/release/bundle/"
