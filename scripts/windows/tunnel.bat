@echo off
setlocal EnableDelayedExpansion
title SCS Tunnel

for %%i in ("%~dp0..\..") do set "ROOT_DIR=%%~fi"

:: ---------- Check cloudflared -------------------------------------------------
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!]  cloudflared not found -- skipping tunnel.
    echo       Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/
    exit /b 0
)

:: ---------- Check tunnel config -----------------------------------------------
set "TUNNEL_CONFIG=%USERPROFILE%\.cloudflared\schedule-config.yml"
if not exist "%TUNNEL_CONFIG%" (
    echo  [ERROR] Tunnel config not found: %TUNNEL_CONFIG%
    echo          Set up your named tunnel first.
    exit /b 1
)

:: ---------- Read frontend port written by launch.bat --------------------------
set "PORT_FILE=%ROOT_DIR%\.frontend_port"
if not exist "%PORT_FILE%" (
    echo  [ERROR] .frontend_port not found. Run launch.bat first.
    exit /b 1
)
set /p FRONTEND_PORT=<"%PORT_FILE%"
echo  [...] Frontend port: !FRONTEND_PORT!

:: ---------- Patch config port using a temp PowerShell script ------------------
:: Avoids batch quoting/pipe-escaping nightmares with inline -Command strings.
set "TEMP_CONFIG=%TEMP%\scs-tunnel-config.yml"
set "PS_PATCH=%TEMP%\scs_patch_tunnel.ps1"

echo (Get-Content '!TUNNEL_CONFIG!') -replace 'localhost:\d+', "localhost:!FRONTEND_PORT!" -replace '127\.0\.0\.1:\d+', "127.0.0.1:!FRONTEND_PORT!" ^| Set-Content '!TEMP_CONFIG!' > "!PS_PATCH!"

powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_PATCH!"
del "!PS_PATCH!" 2>nul

if not exist "%TEMP_CONFIG%" (
    echo  [ERROR] Failed to create patched tunnel config.
    exit /b 1
)

:: ---------- Start tunnel in a new window --------------------------------------
echo  [...] Starting Cloudflare tunnel on port !FRONTEND_PORT!...
start "SCS Tunnel" cmd /k "title SCS Cloudflare Tunnel && cloudflared tunnel --config \"%TEMP_CONFIG%\" run"
echo  [OK] Cloudflare tunnel started.
echo.
endlocal
