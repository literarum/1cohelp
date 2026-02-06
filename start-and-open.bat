@echo off
cd /d "%~dp0"
echo Stopping any old server on port 8765...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8765 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul
echo Starting server on port 8765...
start "1CO Server" python server.py
timeout /t 2 /nobreak >nul
echo Opening browser: http://localhost:8765/
start "" "http://localhost:8765/"
echo.
echo Server is in the other window. Close that window to stop.
