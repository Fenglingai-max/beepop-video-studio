@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22+ x64 from https://nodejs.org/ and reopen this file.
  pause
  popd
  exit /b 1
)
node "%~dp0start.cjs"
if errorlevel 1 pause
popd
