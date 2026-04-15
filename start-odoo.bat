@echo off
echo ========================================
echo Starting Odoo 13 with POS Hybrid Sync
echo ========================================
echo.

REM Navigate to project directory
cd /d "%~dp0"

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo Starting containers...
docker-compose up -d

echo.
echo ========================================
echo Containers started!
echo ========================================
echo.
echo Odoo URL: http://localhost:8069
echo Database: postgres (default)
echo User: odoo
echo Password: odoo
echo.
echo Waiting for Odoo to start (this may take 30-60 seconds)...
timeout /t 10 /nobreak >nul

echo.
echo Opening Odoo in browser...
start http://localhost:8069

echo.
echo To view logs, run: docker-compose logs -f odoo
echo To stop Odoo, run: docker-compose down
echo.
pause
