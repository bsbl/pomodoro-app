#!/usr/bin/env bash
# Dev launcher: installs/upgrades the whole toolchain if needed (see
# scripts/ensure-toolchain.sh), then starts the app in dev mode (tauri dev).
set -e
cd "$(dirname "$0")"
source scripts/ensure-toolchain.sh
npm start
