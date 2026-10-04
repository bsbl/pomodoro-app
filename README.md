# Pomodoro Timer

Application desktop simple pour appliquer la méthode Pomodoro : sessions de 25 minutes,
pauses courtes (5') et longues (15', toutes les 4 sessions), avec intégration
system tray (Windows/Linux) et menu bar (macOS).

## Lancement

**macOS / Linux :**
```bash
./start.sh
```

**Windows :**
```bat
start.bat
```
(double-clic possible dans l'explorateur de fichiers, ou depuis une invite de
commandes / PowerShell)

Ces scripts gèrent toute la chaîne d'outils : ils installent, ou mettent à
jour si la version est trop ancienne, tout ce qui est nécessaire, puis
démarrent l'application en mode développement (`npm start`, qui exécute
`tauri dev`) :

- **macOS** : Xcode Command Line Tools ;
- **Linux** : dépendances système Tauri (webkit2gtk, etc., via `apt-get` ou
  `dnf`, sudo requis) ;
- **Windows** : Visual Studio C++ Build Tools (via `winget`) ;
- **Rust** ≥ `rust-version` de `src-tauri/Cargo.toml`, via
  [rustup](https://rustup.rs/) (`rustup update` s'il est déjà présent ; sinon
  installé dans `~/.cargo`, prioritaire sur une éventuelle installation plus
  ancienne, par ex. via Homebrew) ;
- **Node.js** ≥ 18 (Homebrew sur macOS, NodeSource sur Linux, `winget` sur
  Windows) ;
- **dépendances npm** (`npm install`).

La logique est partagée avec `build.sh`/`build.bat` dans
`scripts/ensure-toolchain.sh` et `scripts/ensure-toolchain.ps1`. Le premier
lancement compile le code Rust et peut prendre quelques minutes.

## Installer Node.js

Les scripts de lancement installent Node.js automatiquement. Pour l'installer
manuellement (version LTS, 18.x ou plus récent) :

**macOS :**
```bash
brew install node
```
(ou télécharger l'installeur depuis [nodejs.org](https://nodejs.org/))

**Windows :**
- Télécharger l'installeur **LTS** depuis [nodejs.org](https://nodejs.org/) et
  l'exécuter (inclut Node.js, npm, et l'ajout au `PATH`).
- Alternative via [winget](https://learn.microsoft.com/windows/package-manager/winget/) :
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

**Linux :**
- Via le gestionnaire de paquets de la distribution (peut fournir une version
  ancienne), par exemple :
  ```bash
  sudo apt install nodejs npm        # Debian/Ubuntu
  sudo dnf install nodejs npm        # Fedora
  ```
- Ou via [nvm](https://github.com/nvm-sh/nvm) (recommandé pour avoir la
  dernière version LTS) :
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  nvm install --lts
  ```

Vérifier l'installation :
```bash
node --version
npm --version
```

## Fonctionnalités

- **Start task** : démarre une session de 25 minutes pour la tâche saisie (avec
  historique des tâches précédentes en autocomplétion/liste cliquable).
- **Stop task** : interrompt la tâche en cours. Une proposition s'affiche
  ensuite : **Take a break** (démarre une pause, courte ou longue selon le
  cycle en cours), **Start new task** (place le focus sur le champ de saisie)
  ou **Close** (reste simplement en Idle). Sans action sous 30 secondes, la
  pause démarre automatiquement (même délai que l'alerte de fin de session).
- **Reset current** : relance la tâche en cours depuis 25 minutes.
- **Pause current / Resume current** : met en pause / reprend le décompte.
- **Fin de session** : alerte visuelle (fenêtre + notification système) et sonore.
  Deux boutons sur l'alerte :
  - **Snooze (+1 min)** : rejoue l'alerte 1 minute plus tard.
  - **Stop (start break)** : démarre la pause immédiatement.
  - Si aucun clic sous 30 secondes, la pause démarre automatiquement.
- **Pauses automatiques** : 5 minutes, ou 15 minutes toutes les 4 sessions complétées.
- **Tray / menu bar** : icône avec statut courant (tâche + temps restant), et menu
  pour afficher la fenêtre ou quitter l'application. Fermer la fenêtre la masque
  dans le tray plutôt que de quitter l'app.
- **Instance unique** : un verrou empêche de lancer une deuxième fenêtre/timer en
  parallèle (utile si l'app est déjà lancée automatiquement au login).
- **Démarrage automatique** : case à cocher "Start automatically on login"
  dans l'interface, sur macOS (LaunchAgent), Windows (Registre `Run`) et Linux
  (entrée XDG `~/.config/autostart`), via le plugin `tauri-plugin-autostart`.
- **Historique des tâches** : sauvegardé dans `~/.pomodoro/history.json`.
- **Configuration** : sauvegardée séparément dans `~/.pomodoro/config.json`
  (préférence de démarrage automatique, et durées/paramètres ci-dessous).
- **Paramètres (durées)** : accessibles via le bouton **⚙** dans la fenêtre, ou
  l'entrée **Settings…** du menu tray/menu bar. Permet de configurer :
  - la durée d'une tâche (25' par défaut),
  - la durée d'une pause courte (5' par défaut),
  - la durée d'une pause longue (15' par défaut),
  - le nombre de tâches avant une pause longue (4 par défaut).

  Les changements ne s'appliquent qu'à la **prochaine** tâche/pause démarrée —
  ils n'affectent pas un décompte déjà en cours.

## Structure du projet

```
pomodoro-app/
  package.json       # CLI Tauri (npm start / npm run tauri:build)
  start.sh / start.bat
  build.sh / build.bat
  scripts/           # installation / mise à jour de la chaîne d'outils
  src-tauri/         # backend Rust (fenêtre, tray, timer, commandes, autostart)
  src/
    renderer/        # interface utilisateur (HTML/CSS/JS)
  assets/
    icons/           # icônes app + tray
    sounds/          # son d'alerte (alert.wav)
```

## Stockage des données

```
~/.pomodoro/
  config.json    # configuration (démarrage automatique, durées des tâches/pauses)
  history.json    # historique des tâches saisies
```

## Release (CI) — build Tauri multi-plateforme

### Build local

**macOS / Linux :**
```bash
./build.sh
```

**Windows :**
```bat
build.bat
```

Comme les scripts de lancement, ils installent ou mettent à jour toute la
chaîne d'outils (voir plus haut), puis lancent `npm run tauri:build`. Les
artefacts (`.app`/`.dmg` sur macOS, `.deb`/`.AppImage`/`.rpm` sur Linux,
`.msi`/`.exe` sur Windows) sont générés dans `target/release/bundle/`.

### Build via GitHub Actions

Le workflow `.github/workflows/release.yml` compile la version Tauri
(`src-tauri/`) pour macOS (binaire universel), Windows et Linux, et publie
les installeurs (`.dmg`/`.app`, `.msi`/`.exe`, `.deb`/`.AppImage`/`.rpm`)
dans une **GitHub Release en brouillon** (draft).

Pour déclencher une release :
```bash
git tag v1.0.0
git push origin v1.0.0
```
(ou lancer le workflow manuellement depuis l'onglet Actions →
"Run workflow").

Une fois le build terminé, ouvrir la release en brouillon sur GitHub,
vérifier les artefacts, puis la publier.

## Notes

- Testé sur macOS. Une validation manuelle reste recommandée sur Windows et
  Linux.
- Le délai de 30 secondes avant le déclenchement automatique de la pause est
  configurable dans `src-tauri/src/timer.rs` (`ALERT_TIMEOUT_SECONDS`).
