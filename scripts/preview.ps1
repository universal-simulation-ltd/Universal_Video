# Launch a local preview of Universal Video.
# Runs the dev server in the foreground — press Ctrl-C to stop.
# Windows equivalent of preview.sh.
#
#   Usage:  .\scripts\preview.ps1 [port]     (default 5199)
#
# 5199 is this app's port in the registry (Docs_UNI_SIM/dev-preview.md).
# --strictPort means a port clash fails loudly instead of silently serving
# this app on another app's port.
# First run installs deps if node_modules is missing.
#
# NOTE — the conversion needs a browser with a WebCodecs H.264 ENCODER, which
# means Chrome, Edge or Safari 16.4+. Firefox will load the page, read a file's
# header and refuse to convert, which is the behaviour to check, not a fault.
# Nothing here needs the internet: no engine is downloaded and no file is sent.

$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $port = if ($args.Count -ge 1) { $args[0] } else { '5199' }

    if (-not (Test-Path 'node_modules')) {
        Write-Host "Installing dependencies (first run)..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }

    Write-Host "Universal Video -> http://localhost:$port" -ForegroundColor Green
    npm run dev -- --port $port --strictPort
} finally {
    Pop-Location
}
