#!/usr/bin/env bash
# Simple launcher: installs dependencies (if needed) and starts the app.
set -e
cd "$(dirname "$0")"
npm install
npm start
