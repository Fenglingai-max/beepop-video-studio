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
echo [2/2] 正在打开助手启动状态页…
"%BEEPOP_NODE%" "%~dp0windows-service.cjs" start
if errorlevel 1 pause
popd
