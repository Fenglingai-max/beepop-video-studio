$ErrorActionPreference = 'Stop'
$base = Join-Path $env:RUNNER_TEMP 'BeePOP Chinese path 测试'
New-Item -ItemType Directory -Force -Path $base | Out-Null
Expand-Archive -LiteralPath (Join-Path $PWD 'BeePOP-Windows.zip') -DestinationPath $base -Force
$root = Join-Path $base 'BeePOP'
$scriptFile = Join-Path $root 'internal\start-windows.ps1'
$errors = $null; $tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile($scriptFile,[ref]$tokens,[ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
function RunEntry([string]$directory,[string]$arguments,[int]$expected) {
    $inputFile = Join-Path $directory 'test-input.txt'; Set-Content -LiteralPath $inputFile -Value 'x' -Encoding ASCII
    $outFile = Join-Path $directory 'test-stdout.log'; $errFile = Join-Path $directory 'test-stderr.log'
    $entry = Join-Path $directory '启动BeePOP.cmd'
    $p = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c',('call "' + $entry + '" ' + $arguments)) -PassThru -NoNewWindow -RedirectStandardInput $inputFile -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $p.WaitForExit(600000)) { Stop-Process -Id $p.Id -Force; throw 'Entry self-test timed out' }
    $p.Refresh(); $text = (Get-Content -LiteralPath $outFile -Raw) + (Get-Content -LiteralPath $errFile -Raw)
    Write-Host $text
    if ($p.ExitCode -ne $expected) { throw ('Entry exit ' + $p.ExitCode + ', expected ' + $expected) }
    if ($text -notmatch 'Press any key to close') { throw 'Console error retention missing' }
    return $text
}
# Actual shipped cmd, PowerShell 5.1, real official Node, Chinese path, and child PATH.
$success = RunEntry $root '-SelfTest' 0
if ($success -notmatch 'WINDOWS_BOOTSTRAP_SELF_TEST_OK' -or $success -notmatch 'BUNDLED_NODE_PATH_AND_LOOPBACK_OK') { throw 'Bootstrap self-test output missing' }
# Running only the cmd without extraction must retain a useful error.
$missing = Join-Path $base 'Missing extraction'; New-Item -ItemType Directory -Path $missing | Out-Null
Copy-Item -LiteralPath (Join-Path $root '启动BeePOP.cmd') -Destination $missing
$text = RunEntry $missing '' 2
if ($text -notmatch 'EXTRACT ALL') { throw 'Missing extraction guidance' }
# A broken manifest must produce logs and leave the cmd window open.
$broken = Join-Path $base 'Invalid manifest'; New-Item -ItemType Directory -Path (Join-Path $broken 'internal') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root '启动BeePOP.cmd') -Destination $broken
Copy-Item -LiteralPath $scriptFile -Destination (Join-Path $broken 'internal')
Set-Content -LiteralPath (Join-Path $broken 'internal\runtime.json') -Encoding UTF8 -Value '{"version":"invalid","files":{}}'
$text = RunEntry $broken '' 1
if ($text -notmatch 'STARTUP FAILED' -or $text -notmatch 'Log:') { throw 'Failure details missing' }
Write-Host 'PASS: actual Windows entry, Node PATH, loopback, extraction failure and logged failure retention'
