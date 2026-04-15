@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Odoo 13 + POS Hybrid Sync
echo Complete Test Environment
echo ========================================
echo.

:menu
echo.
echo Select an option:
echo.
echo 1. Start Odoo (first time setup)
echo 2. Stop Odoo
echo 3. Restart Odoo
echo 4. View Logs (live)
echo 5. Open Odoo in Browser
echo 6. Check Container Status
echo 7. Access Odoo Shell
echo 8. Access Database Shell
echo 9. Update POS Module
echo 0. Exit
echo.

set /p choice="Enter your choice (0-9): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto logs
if "%choice%"=="5" goto browser
if "%choice%"=="6" goto status
if "%choice%"=="7" goto shell
if "%choice%"=="8" goto dbshell
if "%choice%"=="9" goto update
if "%choice%"=="0" goto end

echo Invalid choice!
goto menu

:start
echo.
echo Starting Odoo...
docker-compose up -d
echo.
echo Waiting for Odoo to start (30 seconds)...
timeout /t 30 /nobreak >nul
echo.
echo Opening browser...
start http://localhost:8069
echo.
echo Odoo is starting!
echo URL: http://localhost:8069
echo.
echo First time? Create database:
echo   Database: odoo13_pos
echo   Email: admin@example.com
echo   Password: admin
echo   Demo data: Yes
echo.
pause
goto menu

:stop
echo.
echo Stopping Odoo...
docker-compose down
echo Done!
pause
goto menu

:restart
echo.
echo Restarting Odoo...
docker-compose restart odoo
echo Done!
pause
goto menu

:logs
echo.
echo Viewing logs (Press Ctrl+C to exit)...
echo.
docker-compose logs -f odoo
goto menu

:browser
echo.
echo Opening Odoo in browser...
start http://localhost:8069
echo Done!
pause
goto menu

:status
echo.
echo Container Status:
echo.
docker-compose ps
echo.
echo Docker Stats:
echo.
docker stats --no-stream odoo13_app odoo13_postgres
echo.
pause
goto menu

:shell
echo.
echo Accessing Odoo Shell...
echo (Type 'exit()' to leave)
echo.
set /p dbname="Enter database name (default: odoo13_pos): "
if "%dbname%"=="" set dbname=odoo13_pos
docker exec -it odoo13_app odoo shell -d %dbname%
goto menu

:dbshell
echo.
echo Accessing PostgreSQL Shell...
echo (Type '\q' to leave)
echo.
docker exec -it odoo13_postgres psql -U odoo
goto menu

:update
echo.
echo Updating POS Hybrid Sync Module...
echo.
set /p dbname="Enter database name (default: odoo13_pos): "
if "%dbname%"=="" set dbname=odoo13_pos
docker exec -it odoo13_app odoo -d %dbname% -u weha_pos_self_sync --stop-after-init
echo.
echo Module updated! Restart Odoo to apply changes.
echo.
pause
goto menu

:end
echo.
echo Goodbye!
echo.
exit /b 0
