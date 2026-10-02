@echo off
REM Build launcher: installs Rust (if missing) then produces the packaged
REM Tauri app (.msi/.exe).
cd /d "%~dp0"

where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust/cargo introuvable : installation via rustup-init...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe"
  rustup-init.exe -y
  del rustup-init.exe
  echo.
  echo Rust vient d'etre installe. Ferme cette fenetre et relance build.bat
  echo dans une nouvelle invite de commandes pour que le PATH soit a jour.
  exit /b 0
)

call npm install
if errorlevel 1 exit /b %errorlevel%
call npm run tauri:build
if errorlevel 1 exit /b %errorlevel%

echo.
echo Build termine. Artefacts disponibles dans : target\release\bundle\
