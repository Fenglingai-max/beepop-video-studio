$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$out=Join-Path $root 'network-dist'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$exe=Join-Path $out 'beepoptvc-Connection-Update.exe'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$args=@('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:'+$exe),('/win32manifest:'+(Join-Path $PSScriptRoot 'app.manifest')),('/resource:'+(Join-Path $PSScriptRoot 'relay-network.cjs')+',relay-network.cjs'),('/resource:'+(Join-Path $PSScriptRoot 'relay.cjs')+',relay.cjs'),'/r:System.dll','/r:System.Core.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Net.Http.dll','/r:System.Web.Extensions.dll',(Join-Path $PSScriptRoot 'NetworkUpdate.cs'))
& $compiler @args
if($LASTEXITCODE -ne 0){throw 'Connection update compilation failed'}
$sha=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
$tag='windows-network-'+$env:GITHUB_SHA.Substring(0,12)
$meta=[ordered]@{version='0.6.1';filename='beepoptvc-Connection-Update.exe';bytes=(Get-Item $exe).Length;sha256=$sha;signed=$false;sourceCommit=$env:GITHUB_SHA;releaseTag=$tag;url=('https://github.com/'+$env:GITHUB_REPOSITORY+'/releases/download/'+$tag+'/beepoptvc-Connection-Update.exe')}
[IO.File]::WriteAllText((Join-Path $out 'network-update.json'),($meta|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
Copy-Item (Join-Path $PSScriptRoot 'README.txt') (Join-Path $out 'README.txt')
Compress-Archive -Path (Join-Path $PSScriptRoot '*') -DestinationPath (Join-Path $out 'network-update-source.zip') -Force
Write-Host ('Built '+$meta.bytes+' bytes; SHA256 '+$sha)
