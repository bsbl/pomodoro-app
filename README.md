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

Ces scripts installent les dépendances npm (si nécessaire) puis démarrent
l'application (`npm start`, qui exécute `electron .`).

Prérequis : Node.js et npm installés (voir ci-dessous).

## Installer Node.js

L'application nécessite **Node.js** (qui inclut npm). Version recommandée :
LTS (18.x ou plus récent).

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
- **Démarrage automatique** :
  - **macOS** : case à cocher "Start automatically on login" dans l'interface.
    En interne, gère un LaunchAgent launchd
    (`~/Library/LaunchAgents/com.sebastienbel.pomodoro-timer.plist`) plutôt
    que l'API `setLoginItemSettings` d'Electron — celle-ci s'est révélée peu
    fiable en mode développement non empaqueté sur macOS récent (les
    arguments de lancement custom ne sont pas toujours transmis, ce qui
    faisait démarrer Electron sans projet chargé).
  - **Windows** : même case à cocher, via l'API native Electron
    `setLoginItemSettings` (Registre `Run`), qui fonctionne de façon fiable
    ici.
  - **Linux** (non supporté par ces mécanismes) : la case est masquée et
    remplacée par une note renvoyant vers `install.sh` (voir plus bas).
- **Historique des tâches** : sauvegardé dans `~/.pomodoro/history.json`.
- **Configuration** : sauvegardée séparément dans `~/.pomodoro/config.json`
  (actuellement : préférence de démarrage automatique).

## Structure du projet

```
pomodoro-app/
  package.json
  start.sh
  start.bat
  src/
    main/          # process principal Electron (fenêtre, tray, timer, IPC)
    preload/        # pont sécurisé main <-> renderer
    renderer/        # interface utilisateur (HTML/CSS/JS)
  assets/
    icons/           # icônes app + tray
    sounds/          # son d'alerte (alert.wav)
```

## Stockage des données

```
~/.pomodoro/
  config.json    # configuration (ex: démarrage automatique)
  history.json    # historique des tâches saisies
```

## Auto-start sur Linux (install.sh / uninstall.sh)

Sur macOS et Windows, la case à cocher dans l'UI suffit (voir ci-dessus). Sur
Linux, où l'API Electron correspondante n'est pas implémentée, ces scripts
gèrent l'auto-start à sa place :

```bash
./install.sh     # crée l'entrée XDG autostart
./uninstall.sh   # la retire
```

- Crée une entrée `~/.config/autostart/pomodoro-timer.desktop`, lue
  automatiquement par la session graphique (GNOME/KDE/XFCE...) à la connexion.
- Sur macOS/Windows, `install.sh` refuse de s'exécuter et renvoie vers la case
  à cocher (avoir les deux mécanismes actifs en même temps lancerait l'app deux
  fois au login). `uninstall.sh` retire aussi, en best-effort, tout LaunchAgent
  macOS résiduel créé par une version antérieure de ce script.
- `uninstall.sh` ne fait que retirer l'entrée auto-start ; l'application
  elle-même n'est pas supprimée.

## Notes

- Testé sur macOS. Le code utilise les API cross-platform d'Electron pour le tray,
  les notifications et l'autostart ; une validation manuelle reste recommandée sur
  Windows et Linux.
- Le délai de 30 secondes avant le déclenchement automatique de la pause est
  configurable dans `src/main/timer.js` (`ALERT_TIMEOUT_SECONDS`).
