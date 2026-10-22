$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Test-Path -LiteralPath 'data/remote.env')) { throw 'Falta data/remote.env con PILOT_URL y PILOT_RUNNER_TOKEN del despliegue.' }
if (!(Test-Path -LiteralPath 'node_modules')) { throw 'Primero ejecutar npm ci y npx playwright install chromium desde esta carpeta.' }
Write-Host 'Conectando cuatro ejecutores al MCP de Cloudflare. Mantener esta terminal abierta; Ctrl+C detiene los ejecutores.'
& node --env-file=data/remote.env runner/supervisor.mjs
if ($LASTEXITCODE -ne 0) { throw 'El supervisor terminó con un error.' }
