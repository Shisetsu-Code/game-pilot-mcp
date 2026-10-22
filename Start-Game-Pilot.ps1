$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Test-Path -LiteralPath '.env')) { & node scripts/init-local.mjs; if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la configuración local.' } }
if (!(Test-Path -LiteralPath 'node_modules')) { throw 'Primero ejecutar npm ci y npx playwright install chromium desde esta carpeta.' }
$taskNode = (Get-Command node).Source
$taskServer = Start-Process -FilePath $taskNode -ArgumentList @('--env-file=.env','scripts/local.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
  for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) { try { $taskHealth=Invoke-RestMethod 'http://127.0.0.1:4176/health'; if ($taskHealth.ok) { break } } catch { Start-Sleep -Milliseconds 200 } }
  if (!$taskHealth.ok) { throw 'El coordinador local no respondió.' }
  Write-Host 'Game Pilot listo. Conectar el cliente MCP con data/mcp-config.json. Ctrl+C detiene esta ejecución.'
  & $taskNode --env-file=.env runner/supervisor.mjs
} finally { if (!$taskServer.HasExited) { Stop-Process -Id $taskServer.Id } }
