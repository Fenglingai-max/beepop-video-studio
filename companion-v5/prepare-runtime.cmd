@echo off
set "BEEPOP_NODE=node"
if "%BEEPOP_FORCE_PORTABLE%"=="1" goto portable
where node >nul 2>nul
if errorlevel 1 goto portable
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22&&process.arch==='x64'?0:1)" >nul 2>nul
if errorlevel 1 goto portable
exit /b 0
:portable
set "BEEPOP_NODE=%~dp0data\runtime\node-v24.19.0-win-x64\node.exe"
if exist "%BEEPOP_NODE%" (
  "%BEEPOP_NODE%" -e "process.exit(process.versions.node==='24.19.0'&&process.arch==='x64'?0:1)" >nul 2>nul
  if not errorlevel 1 goto ready
)
echo [1/2] 正在从 Node.js 官网准备运行环境，首次需要联网，请保留此窗口。
set "BEEPOP_BOOT_ROOT=%~dp0"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $runtime=Join-Path $env:BEEPOP_BOOT_ROOT 'data\runtime'; New-Item -ItemType Directory -Force -Path $runtime | Out-Null; $zip=Join-Path $runtime 'node-v24.19.0-win-x64.zip'; Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip' -OutFile $zip -TimeoutSec 300; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant() -ne '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73') { throw 'Node.js 下载校验失败，请重新运行。' }; Expand-Archive -LiteralPath $zip -DestinationPath $runtime -Force; Remove-Item -LiteralPath $zip"
if errorlevel 1 (
  echo 运行环境准备失败。请检查联网后重试，或从 https://nodejs.org/en/download 安装 Node.js 22+ x64。
  exit /b 1
)
if not exist "%BEEPOP_NODE%" exit /b 1
:ready
set "PATH=%~dp0data\runtime\node-v24.19.0-win-x64;%PATH%"
exit /b 0
