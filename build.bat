@echo off
REM Build launcher: installs/upgrades the whole toolchain if needed (see
REM scripts\ensure-toolchain.ps1), then produces the packaged Tauri app
REM (.msi/.exe).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-toolchain.ps1
if errorlevel 1 exit /b %errorlevel%
REM Pick up tools the script may have just installed.
set "PATH=%USERPROFILE%\.cargo\bin;%ProgramFiles%\nodejs;%PATH%"
call npm install
if errorlevel 1 exit /b %errorlevel%
call npm run tauri:build
if errorlevel 1 exit /b %errorlevel%

echo.
echo Build termine. Artefacts disponibles dans : target\release\bundle\
