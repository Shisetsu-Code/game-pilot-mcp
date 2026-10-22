$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskReady = $false
try { $taskHealth = Invoke-RestMethod 'http://127.0.0.1:4188/health'; $taskReady = $taskHealth.app -eq 'game-pilot-launcher' } catch {}
if (!$taskReady) {
  $taskNode = (Get-Command node).Source
  [void](Get-Command gh -ErrorAction Stop)
  New-Item -ItemType Directory -Force -Path data | Out-Null
  Start-Process -FilePath $taskNode -ArgumentList @('scripts/launcher.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/launcher.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/launcher-error.log') | Out-Null
  for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) { try { $taskHealth = Invoke-RestMethod 'http://127.0.0.1:4188/health'; if ($taskHealth.app -eq 'game-pilot-launcher') { $taskReady = $true; break } } catch {} ; Start-Sleep -Milliseconds 200 }
}
if (!$taskReady) { throw 'El lanzador no respondió. Revisar data/launcher-error.log.' }
Start-Process 'http://127.0.0.1:4188'
