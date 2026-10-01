@echo off
rem Makes SIGNAL start by itself every time you sign in to Windows. Run it again to undo.
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SIGNAL.bat"
if exist "%LINK%" (
  del "%LINK%"
  echo SIGNAL will no longer start by itself with Windows.
) else (
  > "%LINK%" echo @echo off
  >> "%LINK%" echo start "SIGNAL" /min "%~dp0start-windows.bat"
  echo Done: SIGNAL now starts by itself every time you sign in to Windows.
  echo Run this file again to undo.
)
pause
