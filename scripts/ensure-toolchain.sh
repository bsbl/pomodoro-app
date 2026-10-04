#!/usr/bin/env bash
# Sourced by start.sh / build.sh. Makes sure the whole Tauri toolchain is
# present and recent enough, installing or upgrading what's needed:
#   - macOS: Xcode Command Line Tools
#   - Linux: webkit2gtk & co. (apt-get or dnf)
#   - Rust >= rust-version from src-tauri/Cargo.toml (via rustup)
#   - Node.js >= MIN_NODE_MAJOR
#   - npm dependencies (npm install)
# Expects the current directory to be the project root.

MIN_NODE_MAJOR=18
MIN_RUST="$(sed -n 's/^rust-version *= *"\(.*\)"/\1/p' src-tauri/Cargo.toml)"

# version_ge A B: true if version A >= version B (numeric, dot-separated).
version_ge() {
  local IFS=.
  local -a a=($1) b=($2)
  local i
  for i in 0 1 2; do
    local x="${a[i]:-0}" y="${b[i]:-0}"
    if ((10#$x > 10#$y)); then return 0; fi
    if ((10#$x < 10#$y)); then return 1; fi
  done
  return 0
}

log() { echo "==> $*"; }

ensure_macos_build_tools() {
  [ "$(uname -s)" = "Darwin" ] || return 0
  if ! xcode-select -p >/dev/null 2>&1; then
    log "Xcode Command Line Tools manquants : lancement de l'installation..."
    xcode-select --install || true
    echo "Termine l'installation dans la fenêtre qui s'est ouverte, puis relance ce script." >&2
    exit 1
  fi
}

ensure_linux_system_deps() {
  [ "$(uname -s)" = "Linux" ] || return 0
  if command -v apt-get >/dev/null 2>&1; then
    if ! dpkg -s libwebkit2gtk-4.1-dev libayatana-appindicator3-dev >/dev/null 2>&1; then
      log "Dépendances système Linux manquantes : installation via apt-get (sudo requis)..."
      sudo apt-get update
      sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
        librsvg2-dev libxdo-dev libssl-dev patchelf build-essential curl wget file
    fi
  elif command -v dnf >/dev/null 2>&1; then
    if ! rpm -q webkit2gtk4.1-devel libappindicator-gtk3-devel >/dev/null 2>&1; then
      log "Dépendances système Linux manquantes : installation via dnf (sudo requis)..."
      sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
        libappindicator-gtk3-devel librsvg2-devel libxdo-devel gcc gcc-c++ make
    fi
  else
    echo "Gestionnaire de paquets non reconnu : installe manuellement les prérequis Tauri" >&2
    echo "(https://v2.tauri.app/start/prerequisites/#linux)." >&2
  fi
}

current_rust_version() {
  rustc --version 2>/dev/null | awk '{print $2}'
}

ensure_rust() {
  # rustup's toolchain goes first on PATH so it wins over any older Rust
  # installed elsewhere (e.g. a stale Homebrew one).
  export PATH="$HOME/.cargo/bin:$PATH"

  local version
  version="$(current_rust_version)"
  if [ -n "$version" ] && version_ge "$version" "$MIN_RUST"; then
    return 0
  fi

  if [ -z "$version" ]; then
    log "Rust introuvable : installation via rustup..."
  else
    log "Rust $version trop ancien (>= $MIN_RUST requis) : mise à jour via rustup..."
  fi

  if command -v rustup >/dev/null 2>&1; then
    rustup update stable
    rustup default stable
  else
    # Skip rustup-init's refusal to install alongside another (outdated)
    # Rust: ~/.cargo/bin is prepended to PATH above, so rustup's wins.
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | RUSTUP_INIT_SKIP_PATH_CHECK=yes sh -s -- -y --default-toolchain stable
  fi
  hash -r

  version="$(current_rust_version)"
  if [ -z "$version" ] || ! version_ge "$version" "$MIN_RUST"; then
    echo "Échec : Rust >= $MIN_RUST requis, trouvé '${version:-aucun}' ($(command -v rustc))." >&2
    exit 1
  fi
  log "Rust $version prêt."
}

current_node_major() {
  node --version 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'
}

install_or_upgrade_node() {
  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    if brew list --versions node >/dev/null 2>&1; then
      brew upgrade node || true
    else
      brew install node
    fi
    export PATH="$(brew --prefix)/bin:$PATH"
  elif command -v apt-get >/dev/null 2>&1; then
    # Distro packages are often too old: use NodeSource's LTS repository.
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
    sudo dnf install -y nodejs
  else
    echo "Impossible d'installer Node.js automatiquement : installe Node.js LTS (https://nodejs.org/) puis relance ce script." >&2
    exit 1
  fi
  hash -r
}

ensure_node() {
  local major
  major="$(current_node_major)"
  if [ -n "$major" ] && [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
    return 0
  fi

  if [ -z "$major" ]; then
    log "Node.js introuvable : installation..."
  else
    log "Node.js v$major trop ancien (>= $MIN_NODE_MAJOR requis) : mise à jour..."
  fi
  install_or_upgrade_node

  major="$(current_node_major)"
  if [ -z "$major" ] || [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    echo "Échec : Node.js >= $MIN_NODE_MAJOR requis, trouvé '${major:-aucun}' ($(command -v node))." >&2
    exit 1
  fi
  log "Node.js $(node --version) prêt."
}

ensure_macos_build_tools
ensure_linux_system_deps
ensure_rust
ensure_node
log "Installation / mise à jour des dépendances npm..."
npm install
