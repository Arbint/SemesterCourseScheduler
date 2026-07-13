@echo off
setlocal EnableDelayedExpansion
title SCS Launch

for %%i in ("%~dp0..\..") do set "ROOT_DIR=%%~fi"

:: Ensure uv is on PATH for this session
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\Programs\uv;%PATH%"

:: ---------- Detect LAN IP -----------------------------------------------------
set "LOCAL_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /r "IPv4.*192\."') do (
    if "!LOCAL_IP!"=="" ( set "RAW=%%a" & set "RAW=!RAW: =!" & set "LOCAL_IP=!RAW!" )
)
if "!LOCAL_IP!"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /r "IPv4.*10\."') do (
        if "!LOCAL_IP!"=="" ( set "RAW=%%a" & set "RAW=!RAW: =!" & set "LOCAL_IP=!RAW!" )
    )
)
if "!LOCAL_IP!"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /r "IPv4.*172\."') do (
        if "!LOCAL_IP!"=="" ( set "RAW=%%a" & set "RAW=!RAW: =!" & set "LOCAL_IP=!RAW!" )
    )
)
if "!LOCAL_IP!"=="" set "LOCAL_IP=<your-lan-ip>"

:: ---------- Find free ports ---------------------------------------------------
echo  [...] Finding available ports...
cd /d "%ROOT_DIR%\backend"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"
for /f "tokens=*" %%p in ('uv run python "%ROOT_DIR%\find_port.py" 8000 8020') do set "BACKEND_PORT=%%p"
for /f "tokens=*" %%p in ('uv run python "%ROOT_DIR%\find_port.py" 5173 5193') do set "FRONTEND_PORT=%%p"
echo  [OK] Backend port: !BACKEND_PORT!   Frontend port: !FRONTEND_PORT!

:: Write port files so vite.config.ts and tunnel.bat know which ports to use
echo !BACKEND_PORT!> "%ROOT_DIR%\.backend_port"
echo !FRONTEND_PORT!> "%ROOT_DIR%\.frontend_port"

:: ---------- Start backend in a new window -------------------------------------
echo  [...] Starting backend server...
start "SCS Backend" /D "%ROOT_DIR%\backend" cmd /k "title SCS Backend && uv run uvicorn main:app --host 0.0.0.0 --port !BACKEND_PORT! --reload"

timeout /t 2 /nobreak >nul

:: ---------- Start frontend in a new window ------------------------------------
echo  [...] Starting frontend server...
start "SCS Frontend" /D "%ROOT_DIR%\frontend" cmd /k "title SCS Frontend && npm run dev -- --host --port !FRONTEND_PORT!"

timeout /t 4 /nobreak >nul

:: Open browser
start http://localhost:!FRONTEND_PORT!

echo.
echo  ====================================================
echo    Semester Course Scheduler is running!
echo  ====================================================
echo.
echo    Local:     http://localhost:!FRONTEND_PORT!
echo    Network:   http://!LOCAL_IP!:!FRONTEND_PORT!
echo    API Docs:  http://localhost:!BACKEND_PORT!/docs
echo.
echo  [OK] Servers started.
echo.
endlocal
