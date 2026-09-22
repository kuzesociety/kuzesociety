@echo off
title SIGNAL
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist dist\engine.mjs (
  echo First run: installing and building...
  call npm ci --no-audit --no-fund || goto :fail
  call npm run build || goto :fail
)
:loop
node dist\engine.mjs
echo.
echo SIGNAL stopped (exit code %errorlevel%). Restarting in 5 seconds - close this window to stop.
timeout /t 5 /nobreak >nul
goto loop
:fail
echo Build failed - see the messages above.
pause
