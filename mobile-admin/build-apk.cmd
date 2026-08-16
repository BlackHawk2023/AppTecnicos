@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  build-apk.cmd - Compila el APK release de mobile-admin
rem
rem  Uso:
rem    build-apk.cmd           -> expo prebuild --clean + assembleRelease
rem    build-apk.cmd fast      -> solo assembleRelease (sin prebuild,
rem                               mas rapido cuando solo cambia el JS)
rem
rem  Resultado: dist\app-release.apk
rem ============================================================

set "MODE=%1"

rem ---------- 1. ANDROID_HOME ----------
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if not defined ANDROID_HOME (
    echo [ERROR] ANDROID_HOME no esta definido.
    echo Ejecuta una sola vez:  setx ANDROID_HOME "C:\ruta\al\Android\Sdk"
    exit /b 1
)
echo [1/4] ANDROID_HOME=%ANDROID_HOME%

rem ---------- 2. prebuild (opcional) ----------
if /i "%MODE%"=="fast" (
    echo [2/4] Modo fast: omitiendo prebuild...
) else (
    echo [2/4] Generando proyecto nativo con expo prebuild --clean...
    set "CI=1"
    call npx expo prebuild --clean
    if errorlevel 1 (
        echo [ERROR] expo prebuild fallo. Revisa el mensaje de arriba.
        exit /b 1
    )
)

rem ---------- 3. build ----------
echo [3/4] Compilando APK release (puede tardar varios minutos)...
cd /d "%~dp0android"
call "%~dp0android\gradlew.bat" assembleRelease
if errorlevel 1 (
    echo [ERROR] El build de Gradle fallo. Revisa el mensaje de arriba.
    exit /b 1
)

rem ---------- 4. copiar APK ----------
if not exist "%~dp0dist" mkdir "%~dp0dist"
copy /Y "%~dp0android\app\build\outputs\apk\release\app-release.apk" "%~dp0dist\app-release.apk" >nul
if errorlevel 1 (
    echo [ERROR] No se encontro el APK generado.
    exit /b 1
)

echo.
echo [4/4] APK listo: %~dp0dist\app-release.apk
echo.
