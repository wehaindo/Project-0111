@echo off
echo ========================================
echo Stopping Odoo 13
echo ========================================
echo.

REM Navigate to project directory
cd /d "%~dp0"

echo Stopping containers...
docker-compose down

echo.
echo ========================================
echo Containers stopped!
echo ========================================
echo.
pause
