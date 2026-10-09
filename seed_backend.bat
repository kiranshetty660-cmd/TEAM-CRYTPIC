@echo off
echo Resetting and Seeding TraceRx Database...
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
python -m app.seed.seed --reset
