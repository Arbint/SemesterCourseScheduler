@echo off
setlocal EnableDelayedExpansion
title Semester Course Scheduler - Launcher
color 0A

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

echo.
echo  ====================================================
echo    Semester Course Scheduler  --  Windows Launcher
echo  ====================================================
echo.

:: ---------- Admin notice -------------------------------------------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Some dependency installs require Administrator privileges.
    echo  [!] If any install fails, right-click this file and choose
    echo      "Run as administrator", then try again.
    echo.
)

:: ---------- Python -------------------------------------------------------------
echo  [...] Checking Python...
set "PYTHON_CMD="
for %%c in (python3 python py) do (
    if "!PYTHON_CMD!"=="" (
        where %%c >nul 2>&1 && set "PYTHON_CMD=%%c"
    )
)

if "!PYTHON_CMD!"=="" (
    echo  [!]  Python not found. Attempting install via winget...
    winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo.
        echo  [ERROR] Could not auto-install Python.
        echo          Download Python 3.12 from: https://www.python.org/downloads/
        echo          Check "Add Python to PATH" during install, then re-run this script.
        echo.
        pause
        exit /b 1
    )
    :: Reload PATH from registry
    for /f "skip=2 tokens=3*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%b"
    for /f "skip=2 tokens=3*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
    set "PATH=!SYS_PATH!;!USER_PATH!;!PATH!"
    where python >nul 2>&1 && set "PYTHON_CMD=python"
)

if "!PYTHON_CMD!"=="" (
    echo  [!]  Python installed but not yet in PATH.
    echo       Close this window and re-run launchWindows.bat
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('!PYTHON_CMD! --version 2^>^&1') do set "PY_VER=%%v"
echo  [OK] Python !PY_VER!

:: ---------- uv ----------------------------------------------------------------
echo  [...] Checking uv...
where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!]  uv not found. Installing...
    :: Try winget first
    winget install --id astral-sh.uv --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    if !errorlevel! neq 0 (
        :: Fall back to PowerShell installer
        echo  [...] Trying PowerShell installer for uv...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    )
    :: Add common uv install locations to PATH for this session
    set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\Programs\uv;%PATH%"
    where uv >nul 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo  [ERROR] uv could not be installed.
        echo          Install manually: https://docs.astral.sh/uv/getting-started/installation/
        echo.
        pause
        exit /b 1
    )
)
for /f "tokens=2" %%v in ('uv --version 2^>^&1') do set "UV_VER=%%v"
echo  [OK] uv !UV_VER!

:: ---------- Node.js -----------------------------------------------------------
echo  [...] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!]  Node.js not found. Installing via winget...
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo.
        echo  [ERROR] Could not auto-install Node.js.
        echo          Download Node.js 20 LTS from: https://nodejs.org/en/download/
        echo          Then re-run this script.
        echo.
        pause
        exit /b 1
    )
    for /f "skip=2 tokens=3*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%b"
    for /f "skip=2 tokens=3*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
    set "PATH=!SYS_PATH!;!USER_PATH!;!PATH!"
    where node >nul 2>&1
    if !errorlevel! neq 0 (
        echo  [!]  Node.js installed but not yet in PATH.
        echo       Close this window and re-run launchWindows.bat
        pause
        exit /b 1
    )
)
for /f "tokens=1" %%v in ('node --version 2^>^&1') do set "NODE_VER=%%v"
echo  [OK] Node.js !NODE_VER!

:: ---------- Backend dependencies ----------------------------------------------
echo  [...] Installing backend dependencies...
cd /d "%SCRIPT_DIR%\backend"
uv sync >nul 2>&1
if !errorlevel! neq 0 (
    echo  [...] Running uv pip install...
    uv pip install fastapi uvicorn sqlalchemy alembic openpyxl anthropic python-multipart
    if !errorlevel! neq 0 (
        echo  [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)
echo  [OK] Backend dependencies ready.

:: ---------- Seed database -----------------------------------------------------
if not exist "%SCRIPT_DIR%\backend\scheduler.db" (
    echo  [...] Database not found -- seeding initial data...
    cd /d "%SCRIPT_DIR%\backend"
    uv run python seed.py
    if !errorlevel! neq 0 (
        echo  [WARN] Seed script failed. App may start with empty data.
    ) else (
        echo  [OK] Database seeded.
    )
)

:: ---------- Frontend dependencies ---------------------------------------------
echo  [...] Installing frontend dependencies...
cd /d "%SCRIPT_DIR%\frontend"
if not exist "node_modules" (
    call npm install --silent
    if !errorlevel! neq 0 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo  [OK] Frontend dependencies installed.
) else (
    echo  [OK] Frontend dependencies already present.
)

:: ---------- Detect LAN IP ----------------------------------------------------
set "LOCAL_IP="
:: Try 192.168.x.x first (most home networks)
for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /r "IPv4.*192\."') do (
    if "!LOCAL_IP!"=="" (
        set "RAW=%%a"
        set "RAW=!RAW: =!"
        set "LOCAL_IP=!RAW!"
    )
)
:: Try 10.x.x.x
if "!LOCAL_IP!"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /r "IPv4.*10\."') do (
        if "!LOCAL_IP!"=="" (
            set "RAW=%%a"
            set "RAW=!RAW: =!"
            set "LOCAL_IP=!RAW!"
        )
    )
)
:: Try 172.x.x.x
if "!LOCAL_IP!"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /r "IPv4.*172\."') do (
        if "!LOCAL_IP!"=="" (
            set "RAW=%%a"
            set "RAW=!RAW: =!"
            set "LOCAL_IP=!RAW!"
        )
    )
)
if "!LOCAL_IP!"=="" set "LOCAL_IP=<your-lan-ip>"

:: ---------- Find free ports ---------------------------------------------------
echo  [...] Finding available ports...
cd /d "%SCRIPT_DIR%\backend"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"
for /f "tokens=*" %%p in ('uv run python "%SCRIPT_DIR%\find_port.py" 8000 8020') do set "BACKEND_PORT=%%p"
for /f "tokens=*" %%p in ('uv run python "%SCRIPT_DIR%\find_port.py" 5173 5193') do set "FRONTEND_PORT=%%p"
echo  [OK] Backend port: !BACKEND_PORT!   Frontend port: !FRONTEND_PORT!

:: Write port file so vite.config.ts picks up the backend port
echo !BACKEND_PORT!> "%SCRIPT_DIR%\.backend_port"

:: ---------- Start Backend in a new window ------------------------------------
echo.
echo  [...] Starting backend server...
start "SCS Backend" /D "%SCRIPT_DIR%\backend" cmd /k "title SCS Backend && uv run uvicorn main:app --host 0.0.0.0 --port !BACKEND_PORT! --reload"

timeout /t 3 /nobreak >nul

:: ---------- Start Frontend in a new window -----------------------------------
echo  [...] Starting frontend server...
start "SCS Frontend" /D "%SCRIPT_DIR%\frontend" cmd /k "title SCS Frontend && npm run dev -- --host --port !FRONTEND_PORT!"

timeout /t 4 /nobreak >nul

:: ---------- Open browser -----------------------------------------------------
start http://localhost:!FRONTEND_PORT!

:: ---------- Print access info ------------------------------------------------
echo.
echo  ====================================================
echo    Semester Course Scheduler is running!
echo  ====================================================
echo.
echo    Local:     http://localhost:!FRONTEND_PORT!
echo    Network:   http://!LOCAL_IP!:!FRONTEND_PORT!
echo    API Docs:  http://localhost:!BACKEND_PORT!/docs
echo.
echo    Other computers on your LAN can open:
echo    http://!LOCAL_IP!:!FRONTEND_PORT!
echo.
echo  ====================================================
echo.
echo  Two server windows were opened:
echo    "SCS Backend"   -- Python / FastAPI  (port !BACKEND_PORT!)
echo    "SCS Frontend"  -- Vite / React      (port !FRONTEND_PORT!)
echo.
echo  Close those windows to stop the servers.
echo  You can close THIS window now.
echo.
pause
endlocal
