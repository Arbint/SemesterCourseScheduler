@echo off
setlocal EnableDelayedExpansion
title Semester Course Scheduler - Launcher
color 0A

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "SCRIPTS=%SCRIPT_DIR%\scripts\windows"

echo.
echo  ====================================================
echo    Semester Course Scheduler  --  Windows Launcher
echo  ====================================================
echo.

:: ---------- 1. Setup ----------------------------------------------------------
call "%SCRIPTS%\setup.bat"
if !errorlevel! neq 0 (
    echo  [ERROR] Setup failed. See messages above.
    pause
    exit /b 1
)

:: ---------- 2. Launch servers -------------------------------------------------
call "%SCRIPTS%\launch.bat"
if !errorlevel! neq 0 (
    echo  [ERROR] Launch failed. See messages above.
    pause
    exit /b 1
)

:: ---------- 3. Tunnel ---------------------------------------------------------
call "%SCRIPTS%\tunnel.bat"
if !errorlevel! neq 0 (
    echo  [ERROR] Tunnel failed. See messages above.
    pause
    exit /b 1
)

:: ---------- Done --------------------------------------------------------------
echo  ====================================================
echo    Three server windows were opened:
echo      "SCS Backend"   -- Python / FastAPI
echo      "SCS Frontend"  -- Vite / React
echo      "SCS Tunnel"    -- Cloudflare tunnel
echo.
echo    Close those windows to stop the servers.
echo    You can close THIS window now.
echo  ====================================================
echo.
pause
endlocal
