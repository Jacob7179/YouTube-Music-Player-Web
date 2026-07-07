```bat
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
REM Find Android SDK automatically.
REM Change this manually only if your SDK is elsewhere.
REM ------------------------------------------------------------
set "SDK_DIR="

if defined ANDROID_HOME (
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
    echo Open Android Studio ^> SDK Manager and check Android SDK Location.
    echo Then set SDK_DIR manually in this run.bat file.
    goto :error
)

if not exist "%SDK_DIR%\platform-tools" (
    echo.
    echo ERROR: This does not appear to be a valid Android SDK folder:
    echo %SDK_DIR%
    goto :error
)

echo.
echo Android SDK found:
echo %SDK_DIR%

REM ------------------------------------------------------------
REM Add Android platform only when it does not already exist.
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
    echo Android platform already exists. Skipping "cap add android".
)

REM ------------------------------------------------------------
REM Create / update android\local.properties
REM Backslashes must be escaped for Gradle.
REM ------------------------------------------------------------
set "SDK_DIR_GRADLE=%SDK_DIR:\=\\%"

echo.
echo ==========================================
echo Creating android\local.properties...
echo ==========================================

(
    echo sdk.dir=%SDK_DIR_GRADLE%
) > "android\local.properties"

echo Created:
type "android\local.properties"

REM ------------------------------------------------------------
REM Copy updated web files into Android project.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Syncing Capacitor files...
echo ==========================================
call npx cap sync android
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Build debug APK.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Building debug APK...
echo ==========================================

cd /d "%~dp0android"
call gradlew.bat assembleDebug
if errorlevel 1 goto :error

echo.
echo ==========================================
echo BUILD SUCCESSFUL
echo ==========================================
echo.
echo Your APK is located at:
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
```
