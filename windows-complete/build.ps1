$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$out = Join-Path $project 'complete-dist'
$stage = Join-Path $project 'complete-build'
New-Item -ItemType Directory -Force -Path $out,$stage | Out-Null
$helper = Join-Path $project 'companion-verified.zip'
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $project 'local-companion-v5.json') | ConvertFrom-Json
function Get-Sha([string] $file) {
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($file)
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
if ((Get-Sha $helper) -ne $manifest.sha256) { throw 'Embedded helper does not match the audited manifest' }
$nodeZip = Join-Path $stage 'node-v24.19.0-win-x64.zip'
Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip' -OutFile $nodeZip
$nodeHash = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
if ((Get-Sha $nodeZip) -ne $nodeHash) { throw 'Official Node runtime checksum mismatch' }

$environment = Join-Path $stage 'environment.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $environment) { Remove-Item $environment }
$envRoot = Join-Path $stage 'environment'
$zip = [IO.Compression.ZipFile]::Open($environment,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($folder in @('node_modules','data')) {
    Get-ChildItem -LiteralPath (Join-Path $envRoot $folder) -Recurse -File -Force | ForEach-Object {
      $relative = $_.FullName.Substring($envRoot.Length + 1).Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$_.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
} finally { $zip.Dispose() }
$envMeta = [ordered]@{sha256=(Get-Sha $environment);bytes=(Get-Item $environment).Length}
$envJson = Join-Path $stage 'environment.json'
[IO.File]::WriteAllText($envJson,($envMeta|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))

$payloadJson = Join-Path $stage 'payload.json'
[IO.File]::WriteAllText($payloadJson, ($manifest | Select-Object version,bytes,sha256 | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
Add-Type -AssemblyName System.Drawing
$logo = [Drawing.Image]::FromFile((Join-Path $project 'beepop-logo.png'))
$bitmap = New-Object Drawing.Bitmap(64,64)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImage($logo,0,0,64,64)
$icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
$iconFile = Join-Path $stage 'app.ico'
$iconStream = [IO.File]::Create($iconFile)
$icon.Save($iconStream)
$iconStream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $logo.Dispose()
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $out 'beepoptvc-Assistant.exe'
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:'+$exe),('/win32icon:'+$iconFile),('/win32manifest:'+(Join-Path $PSScriptRoot 'app.manifest')),('/resource:'+$helper+',helper.zip'),('/resource:'+$environment+',environment.zip'),('/resource:'+$envJson+',environment.json'),('/resource:'+(Join-Path $PSScriptRoot 'offline-guard.cjs')+',offline-guard.cjs'),('/resource:'+$nodeZip+',node-runtime.zip'),('/resource:'+$payloadJson+',payload.json'),('/resource:'+$iconFile+',app.ico'),'/r:System.dll','/r:System.Core.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Net.Http.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll',(Join-Path $PSScriptRoot 'Assistant.cs'))
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Native app compilation failed' }
$commit = $env:GITHUB_SHA
$tag = 'windows-complete-' + $commit.Substring(0,12)
$metadata = [ordered]@{version='0.6.0-preview';filename='beepoptvc-Assistant.exe';bytes=(Get-Item $exe).Length;sha256=(Get-Sha $exe);payloadSha256=$manifest.sha256;embeddedNodeSha256=$nodeHash;environmentSha256=$envMeta.sha256;fullyBundled=$true;sourceCommit=$commit;releaseTag=$tag;signed=$false;url=('https://github.com/'+$env:GITHUB_REPOSITORY+'/releases/download/'+$tag+'/beepoptvc-Assistant.exe')}
[IO.File]::WriteAllText((Join-Path $out 'windows-complete-app.json'),($metadata | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText((Join-Path $out 'SHA256SUMS.txt'),($metadata.sha256+'  beepoptvc-Assistant.exe'+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
Copy-Item (Join-Path $PSScriptRoot 'README.txt') (Join-Path $out '使用说明.txt')
Compress-Archive -Path (Join-Path $PSScriptRoot 'Assistant.cs'),(Join-Path $PSScriptRoot 'app.manifest'),(Join-Path $PSScriptRoot 'build.ps1'),(Join-Path $PSScriptRoot 'README.txt'),(Join-Path $PSScriptRoot 'build-environment.cjs'),(Join-Path $PSScriptRoot 'offline-guard.cjs') -DestinationPath (Join-Path $out 'windows-app-source.zip') -Force
Write-Host ('Built native app: '+$metadata.bytes+' bytes, SHA256 '+$metadata.sha256)

Copy-Item (Join-Path $stage 'environment-files.json') $out
