@echo off
echo ========================================
echo Odoo 13 Logs (Press Ctrl+C to exit)
echo ========================================
echo.

REM Navigate to project directory
cd /d "%~dp0"

docker-compose logs -f odoo
