@echo off
rem ------------------------------------------------------------------
rem  RAIZIA - inicio en Windows
rem    iniciar-raizia.bat               inicia la aplicacion
rem    iniciar-raizia.bat reconstruir   vuelve a compilar (tras cambiar el codigo o la marca)
rem    iniciar-raizia.bat dev           modo desarrollo (recarga al editar)
rem ------------------------------------------------------------------
setlocal
title RAIZIA
cd /d "%~dp0"

echo.
echo   RAIZIA - Nuestras raices, nuestros derechos
echo   -------------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Falta Node.js 22 o superior. Descargalo en https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo   Instalando dependencias ^(solo la primera vez^)...
  call npm install
  if errorlevel 1 (
    echo   [X] No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

if not exist .env.local (
  copy /y .env.example .env.local >nul
  echo   [!] Se creo el archivo .env.local. Abrelo y cambia ADMIN_PASSWORD
  echo       antes de usar la seccion Administracion.
  echo.
)

where ollama >nul 2>nul
if errorlevel 1 (
  echo   [!] Ollama no esta instalado. RAIZIA funcionara en modo de busqueda
  echo       documental, sin respuestas redactadas por IA. https://ollama.com
  echo.
) else (
  curl -s -m 2 http://127.0.0.1:11434/api/tags >nul 2>nul
  if errorlevel 1 (
    echo   Iniciando Ollama...
    start "Ollama" /min ollama serve
  )
)

if /i "%~1"=="dev" goto dev
if /i "%~1"=="reconstruir" if exist .next rmdir /s /q .next

if not exist .next\BUILD_ID (
  echo   Preparando la aplicacion ^(puede tardar un minuto^)...
  call npm run build
  if errorlevel 1 (
    echo   [X] La compilacion fallo. Revisa los mensajes anteriores.
    pause
    exit /b 1
  )
)

echo   RAIZIA se abrira en http://localhost:3000
echo   Para detenerla, cierra esta ventana o presiona Ctrl+C.
echo.
start "" /min cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
goto fin

:dev
echo   Modo desarrollo en http://localhost:3000
echo.
start "" /min cmd /c "timeout /t 6 >nul & start http://localhost:3000"
call npm run dev

:fin
endlocal
