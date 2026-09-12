# Rebuild first so a failed build leaves the existing container running.
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    Write-Host 'Building Docker image...' -ForegroundColor Yellow
    docker compose -f docker-compose.local.yml build
    if ($LASTEXITCODE -ne 0) { throw 'Docker build failed; existing container was not stopped.' }

    Write-Host 'Starting container and waiting for its health check...' -ForegroundColor Yellow
    docker compose -f docker-compose.local.yml up -d --wait --wait-timeout 60
    if ($LASTEXITCODE -ne 0) { throw 'Container did not become healthy. Check docker compose -f docker-compose.local.yml logs.' }

    Write-Host 'Ready: http://localhost:8080 (admin/admin)' -ForegroundColor Green
    Write-Host 'Logs: docker compose -f docker-compose.local.yml logs -f' -ForegroundColor Cyan
} finally {
    Pop-Location
}
