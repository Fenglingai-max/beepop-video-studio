@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
call "%~dp0prepare-runtime.cmd"
if errorlevel 1 (
  pause
  popd
  exit /b 1
)
"%BEEPOP_NODE%" "%~dp0diagnose.cjs"
pause
popd
