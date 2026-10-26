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
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $runtime=[IO.Path]::Combine($env:BEEPOP_BOOT_ROOT,'data','runtime'); [IO.Directory]::CreateDirectory($runtime) | Out-Null; $zip=[IO.Path]::Combine($runtime,'node-v24.19.0-win-x64.zip'); $client=New-Object Net.WebClient; try { $client.DownloadFile('https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip',$zip) } finally { $client.Dispose() }; $stream=[IO.File]::OpenRead($zip); $sha=[Security.Cryptography.SHA256]::Create(); try { $actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }; if ($actual -ne '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73') { throw 'Node.js checksum failed; run again.' }; [Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null; $vendor=[IO.Path]::Combine($runtime,'node-v24.19.0-win-x64'); if ([IO.Directory]::Exists($vendor)) { [IO.Directory]::Delete($vendor,$true) }; [IO.Compression.ZipFile]::ExtractToDirectory($zip,$runtime); [IO.File]::Delete($zip)"
if errorlevel 1 (
  echo 运行环境准备失败。请检查联网后重试，或从 https://nodejs.org/en/download 安装 Node.js 22+ x64。
  exit /b 1
)
if not exist "%BEEPOP_NODE%" exit /b 1
:ready
set "PATH=%~dp0data\runtime\node-v24.19.0-win-x64;%PATH%"
exit /b 0
