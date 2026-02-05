Write-Host "Запуск HTTP сервера на порту 8000..." -ForegroundColor Green
Write-Host "Откройте в браузере: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Для остановки нажмите Ctrl+C" -ForegroundColor Yellow
Write-Host ""

# Останавливаем старые процессы на порту 8000
$processes = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($processes) {
    Write-Host "Остановка старых процессов на порту 8000..." -ForegroundColor Yellow
    $processes | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

# Запускаем сервер
python -m http.server 8000
