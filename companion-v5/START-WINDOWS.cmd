@echo off
if /i "%~1"=="--run" goto run
"%SystemRoot%\System32\cmd.exe" /d /k call "%~f0" --run
if errorlevel 1 pause
exit /b
:run
setlocal
pushd "%~dp0"
if not exist "%~dp0start-beepoptvc.cmd" (
  echo ERROR: The helper files are missing.
  echo Fully extract the complete ZIP, then run START-WINDOWS.cmd from that folder.
  exit /b 2
)
if not exist "%~dp0data" mkdir "%~dp0data"
echo beepoptvc Windows startup > "%~dp0data\startup-entry.log"
echo Starting helper. First-time setup needs Internet access; please wait.
echo Log file: "%~dp0data\startup-entry.log"
echo.
call "%~dp0start-beepoptvc.cmd" <nul >> "%~dp0data\startup-entry.log" 2>&1
set "BEEPOP_ENTRY_CODE=%ERRORLEVEL%"
type "%~dp0data\startup-entry.log"
echo.
echo Startup script exit code: %BEEPOP_ENTRY_CODE%
echo If no browser opens, try http://127.0.0.1:47831/startup
echo If that page cannot connect, send data\startup-entry.log to the maintainer.
echo This window will stay open. Close it only after reading the result.
popd
exit /b %BEEPOP_ENTRY_CODE%
