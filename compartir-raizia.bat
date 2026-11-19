@echo off
rem ------------------------------------------------------------------
rem  RAIZIA - enlace publico temporal (Cloudflare Quick Tunnel)
rem  Inicia la aplicacion en el puerto 3100 y abre un tunel. El enlace
rem  https://....trycloudflare.com aparece en esta ventana y deja de
rem  funcionar al cerrarla o al apagar el equipo.
rem ------------------------------------------------------------------
setlocal
title RAIZIA - enlace temporal
cd /d "%~dp0"

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo   [X] Falta cloudflared. Instalalo con:  winget install Cloudflare.cloudflared
  pause
  exit /b 1
)

if not exist .next\BUILD_ID (
  echo   Preparando la aplicacion...
  call npm run build
  if errorlevel 1 (
    echo   [X] La compilacion fallo.
    pause
    exit /b 1
  )
)

curl -s -m 2 http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 start "Ollama" /min ollama serve

echo   Iniciando RAIZIA en el puerto 3100...
rem cmd /k deja la ventana abierta: si el servidor se detiene, el error queda a la vista.
start "RAIZIA 3100" /min cmd /k "npx next start -p 3100"
timeout /t 8 >nul
curl -s -o nul -m 5 http://localhost:3100/
if errorlevel 1 (
  echo   [X] RAIZIA no arranco. Revisa la ventana "RAIZIA 3100".
  pause
  exit /b 1
)

echo.
echo   Copia el enlace https://....trycloudflare.com que aparece abajo.
echo   Cualquier persona con el enlace podra usar RAIZIA mientras esta
echo   ventana siga abierta. Cierrala para dejar de compartir.
echo.
cloudflared tunnel --no-autoupdate --url http://localhost:3100
endlocal
