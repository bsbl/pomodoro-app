# Pomodoro Timer

Application desktop simple pour appliquer la méthode Pomodoro : sessions de 25 minutes,
pauses courtes (5') et longues (15', toutes les 4 sessions), avec intégration
system tray (Windows/Linux) et menu bar (macOS).

## Lancement

```bash
./start.sh
```

Ce script installe les dépendances npm (si nécessaire) puis démarre l'application
(`npm start`, qui exécute `electron .`).

Prérequis : Node.js et npm installés.

## Fonctionnalités

- **Start task** : démarre une session de 25 minutes pour la tâche saisie (avec
  historique des tâches précédentes en autocomplétion/liste cliquable).
- **Stop task** : interrompt la tâche en cours, retour à l'état "Idle".
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
- **Démarrage automatique** : case à cocher "Start automatically on login" dans
  l'interface (utilise l'API native Electron `setLoginItemSettings` — fonctionne
  sur macOS et Windows). Pour Linux (non supporté par cette API), voir
  `install.sh` ci-dessous.
- **Historique des tâches** : sauvegardé dans `~/.pomodoro/history.json`.
- **Configuration** : sauvegardée séparément dans `~/.pomodoro/config.json`
  (actuellement : préférence de démarrage automatique).

## Structure du projet

```
pomodoro-app/
  package.json
  start.sh
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

## Installer/désinstaller comme service auto-start (macOS / Linux)

En complément de la case à cocher dans l'UI, deux scripts permettent d'enregistrer
l'application comme service qui démarre automatiquement à la connexion :

```bash
./install.sh     # installe le service auto-start
./uninstall.sh   # le désinstalle
```

- **macOS** : crée un LaunchAgent (`~/Library/LaunchAgents/com.sebastienbel.pomodoro-timer.plist`)
  chargé via `launchctl`. L'app démarre à la prochaine connexion, ou immédiatement
  avec `launchctl kickstart -k gui/$(id -u)/com.sebastienbel.pomodoro-timer`.
- **Linux** : crée une entrée XDG autostart (`~/.config/autostart/pomodoro-timer.desktop`),
  lue automatiquement par la session graphique (GNOME/KDE/XFCE...) à la connexion.
- **Windows** : ces scripts `.sh` ne s'appliquent pas. Utilise la case à cocher
  "Start automatically on login" dans l'interface (Registre Windows via Electron).

`uninstall.sh` ne fait que retirer l'entrée auto-start ; l'application elle-même
n'est pas supprimée.

## Notes

- Testé sur macOS. Le code utilise les API cross-platform d'Electron pour le tray,
  les notifications et l'autostart ; une validation manuelle reste recommandée sur
  Windows et Linux.
- Le délai de 30 secondes avant le déclenchement automatique de la pause est
  configurable dans `src/main/timer.js` (`ALERT_TIMEOUT_SECONDS`).
