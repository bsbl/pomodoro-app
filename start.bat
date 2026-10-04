@echo off
REM Dev launcher: installs/upgrades the whole toolchain if needed (see
REM scripts\ensure-toolchain.ps1), then starts the app in dev mode (tauri dev).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-toolchain.ps1
if errorlevel 1 exit /b %errorlevel%
REM Pick up tools the script may have just installed.
set "PATH=%USERPROFILE%\.cargo\bin;%ProgramFiles%\nodejs;%PATH%"
call npm install
if errorlevel 1 exit /b %errorlevel%
call npm start
