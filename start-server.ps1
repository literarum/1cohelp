Write-Host "Starting local HTTP server on port 8000..." -ForegroundColor Green
Write-Host "Open http://localhost:8000 in your browser" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
python -m http.server 8000
