@echo off
start "WaxPrint ERP Backend" cmd /k "cd /d %~dp0backend && start_backend.bat"
start "WaxPrint ERP Frontend" cmd /k "cd /d %~dp0frontend && start_frontend.bat"
echo Backend and frontend launch windows opened.
