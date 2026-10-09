@echo off
echo ===================================================
echo Starting TraceRx Full-Stack Application...
echo ===================================================
echo Backend API: http://localhost:8000
echo Frontend UI: http://localhost:3000
echo ===================================================

start "TraceRx Backend (FastAPI)" cmd /k "%~dp0run_backend.bat"
timeout /t 3 /nobreak >nul
start "TraceRx Frontend (Next.js)" cmd /k "%~dp0run_frontend.bat"

echo Servers launched in separate console windows.
echo Navigate to http://localhost:3000 in your browser.
