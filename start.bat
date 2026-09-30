@echo off
REM Simple launcher: installs dependencies (if needed) and starts the app.
cd /d "%~dp0"
call npm install
if errorlevel 1 exit /b %errorlevel%
call npm start
