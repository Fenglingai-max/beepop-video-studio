@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [需要安装] 请先安装 Node.js 22 或更新版本的 x64 版。
  echo 官方下载：https://nodejs.org/en/download
  echo 安装后重新双击此文件。不要在 ZIP 压缩包里直接运行。
  pause
  popd
  exit /b 1
)
node "%~dp0windows-service.cjs" stop
if errorlevel 1 pause
popd
