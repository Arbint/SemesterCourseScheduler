@echo off
setlocal EnableDelayedExpansion
title SCS Setup

for %%i in ("%~dp0..\..") do set "ROOT_DIR=%%~fi"

echo.
echo  [...] Starting setup...
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
    for /f "skip=2 tokens=3*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%b"
    for /f "skip=2 tokens=3*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
    set "PATH=!SYS_PATH!;!USER_PATH!;!PATH!"
    where python >nul 2>&1 && set "PYTHON_CMD=python"
)
if "!PYTHON_CMD!"=="" (
    echo  [!]  Python installed but not yet in PATH.
    echo       Close this window and re-run setup.bat.
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
    winget install --id astral-sh.uv --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    if !errorlevel! neq 0 (
        echo  [...] Trying PowerShell installer for uv...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    )
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
        echo       Close this window and re-run setup.bat.
        pause
        exit /b 1
    )
)
for /f "tokens=1" %%v in ('node --version 2^>^&1') do set "NODE_VER=%%v"
echo  [OK] Node.js !NODE_VER!

:: ---------- Backend dependencies ----------------------------------------------
echo  [...] Installing backend dependencies...
cd /d "%ROOT_DIR%\backend"
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
if not exist "%ROOT_DIR%\backend\scheduler.db" (
    echo  [...] Database not found -- seeding initial data...
    cd /d "%ROOT_DIR%\backend"
    uv run python seed.py
    if !errorlevel! neq 0 (
        echo  [WARN] Seed script failed. App may start with empty data.
    ) else (
        echo  [OK] Database seeded.
    )
) else (
    echo  [OK] Database already exists -- skipping seed.
)

:: ---------- Frontend dependencies ---------------------------------------------
echo  [...] Installing frontend dependencies...
cd /d "%ROOT_DIR%\frontend"
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

echo.
echo  [OK] Setup complete.
echo.
endlocal
