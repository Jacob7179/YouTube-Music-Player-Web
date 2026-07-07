@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM  YouTube Music Player - Android APK Build Script
REM ============================================================

cd /d "%~dp0"

echo.
echo ==========================================
echo Installing Node.js dependencies...
echo ==========================================
call npm install
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Find Android SDK.
REM First use the bundled android-sdk folder.
REM ------------------------------------------------------------
set "SDK_DIR="

if exist "%~dp0android-sdk\platform-tools" (
    set "SDK_DIR=%~dp0android-sdk"
)

if not defined SDK_DIR if defined ANDROID_HOME (
    set "SDK_DIR=%ANDROID_HOME%"
)

if not defined SDK_DIR if defined ANDROID_SDK_ROOT (
    set "SDK_DIR=%ANDROID_SDK_ROOT%"
)

if not defined SDK_DIR if exist "%LOCALAPPDATA%\Android\Sdk" (
    set "SDK_DIR=%LOCALAPPDATA%\Android\Sdk"
)

if not defined SDK_DIR (
    echo.
    echo ERROR: Android SDK folder was not found.
    echo Expected: %~dp0android-sdk
    goto :error
)

if not exist "%SDK_DIR%\platform-tools" (
    echo.
    echo ERROR: Invalid Android SDK folder:
    echo %SDK_DIR%
    goto :error
)

echo.
echo Android SDK found:
echo %SDK_DIR%

REM ------------------------------------------------------------
REM Create Android project first.
REM capacitor-assets cannot generate Android icons before this.
REM ------------------------------------------------------------
if not exist "android" (
    echo.
    echo ==========================================
    echo Adding Capacitor Android platform...
    echo ==========================================
    call npx cap add android
    if errorlevel 1 goto :error
) else (
    echo.
    echo Android platform already exists.
)

REM ------------------------------------------------------------
REM Create Android SDK path file.
REM ------------------------------------------------------------
set "SDK_DIR_GRADLE=%SDK_DIR:\=\\%"

echo.
echo ==========================================
echo Creating android\local.properties...
echo ==========================================

(
    echo sdk.dir=%SDK_DIR_GRADLE%
) > "android\local.properties"

type "android\local.properties"

REM ------------------------------------------------------------
REM Prepare launcher icon source.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Preparing app icon...
echo ==========================================

if not exist "assets" (
    mkdir assets
)

if not exist "www\resource\icon\app-icon-512.png" (
    echo ERROR: Icon file not found:
    echo www\resource\icon\app-icon-512.png
    goto :error
)

copy /Y "www\resource\icon\app-icon-512.png" "assets\icon-only.png"
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Generate Android launcher icon files.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Generating Android app icons...
echo ==========================================

call npm install -D @capacitor/assets
if errorlevel 1 goto :error

call npx capacitor-assets generate --android
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Sync latest web files into Android.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Syncing Capacitor files...
echo ==========================================

call npx cap sync android
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Build APK.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Building debug APK...
echo ==========================================

cd /d "%~dp0android"

call gradlew.bat clean
if errorlevel 1 goto :error

call gradlew.bat assembleDebug
if errorlevel 1 goto :error

echo.
echo ==========================================
echo BUILD SUCCESSFUL
echo ==========================================
echo.
echo APK location:
echo %~dp0android\app\build\outputs\apk\debug\app-debug.apk
echo.

pause
exit /b 0

:error
echo.
echo ==========================================
echo BUILD FAILED
echo ==========================================
echo.
pause
exit /b 1