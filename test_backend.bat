@echo off
echo Running TraceRx Pytest Suite...
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
pytest -v
