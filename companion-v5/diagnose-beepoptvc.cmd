@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js 22+ x64 from https://nodejs.org/
  pause
  popd
  exit /b 1
)
node "%~dp0diagnose.cjs"
pause
popd
