@echo off
title SIGNAL
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet.
  echo   1. The download page opens now: pick the LTS version.
  echo   2. Install it - click Next until Finish.
  echo   3. Double-click start-windows.bat again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist dist\engine.mjs (
  echo First run: installing and building...
  call npm ci --no-audit --no-fund || goto :fail
  call npm run build || goto :fail
)
rem this window restarts the bot when it stops, so the dashboard can restart it to apply
rem settings and to install updates
set SIGNAL_SUPERVISED=1
set SIGNAL_OPEN_BROWSER=1
set SIGNAL_SELF_UPDATE=1
:loop
rem one block, read whole before the bot starts, because an update replaces this file meanwhile
(
  node dist\engine.mjs
  if errorlevel 76 goto stopped
  if errorlevel 75 goto restart
  goto stopped
)
:restart
echo Restarting to apply the change...
timeout /t 1 /nobreak >nul
goto loop
:stopped
echo.
echo SIGNAL stopped (exit code %errorlevel%). Restarting in 5 seconds - close this window to stop.
timeout /t 5 /nobreak >nul
goto loop
:fail
echo Build failed - see the messages above.
pause
