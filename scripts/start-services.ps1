# Kill any existing dotnet processes
Get-Process dotnet -ErrorAction SilentlyContinue | Stop-Process -Force -PassThru | Out-Null
Start-Sleep -Seconds 2

$root = Split-Path -Parent $PSScriptRoot
$apiPath = Join-Path $root "api\JobCopilot.Api"
$workerPath = Join-Path $root "worker\JobCopilot.Worker"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting JobCopilot Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Start API in background, output redirected to a log file (not -NoNewWindow,
# which requires an attached console and silently fails when launched headlessly)
Write-Host "`nStarting API on http://localhost:5220..." -ForegroundColor Green
$apiProcess = Start-Process -FilePath "dotnet" -ArgumentList "run --no-build" `
    -WorkingDirectory $apiPath -PassThru `
    -RedirectStandardOutput (Join-Path $logDir "api.out.log") `
    -RedirectStandardError (Join-Path $logDir "api.err.log")

if ($null -eq $apiProcess) {
    Write-Host "API failed to start!" -ForegroundColor Red
    exit 1
}
Write-Host "API Process ID: $($apiProcess.Id)" -ForegroundColor Green

Start-Sleep -Seconds 3

# Start Worker the same way
Write-Host "`nStarting Worker Service..." -ForegroundColor Green
$workerProcess = Start-Process -FilePath "dotnet" -ArgumentList "run --no-build" `
    -WorkingDirectory $workerPath -PassThru `
    -RedirectStandardOutput (Join-Path $logDir "worker.out.log") `
    -RedirectStandardError (Join-Path $logDir "worker.err.log")

if ($null -eq $workerProcess) {
    Write-Host "Worker failed to start!" -ForegroundColor Red
    exit 1
}
Write-Host "Worker Process ID: $($workerProcess.Id)" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Services Started" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nAPI:      http://localhost:5220"
Write-Host "Swagger:  http://localhost:5220/swagger"
Write-Host "Frontend: http://localhost:5173  (start separately: cd frontend; npm run dev)"
Write-Host "Logs:     $logDir"
Write-Host "`nTo stop: Get-Process dotnet | Stop-Process -Force"
