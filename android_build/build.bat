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
    echo Expected bundled SDK path:
    echo %~dp0android-sdk
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
REM Create android\local.properties with SDK location.
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
REM Sync latest web files into Android project.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Syncing Capacitor files...
echo ==========================================

call npx cap sync android
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Replace Android icon and splash resources from image_source\res.
REM Source path:
REM android_build\image_source\res
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Replacing Android app icon and splash resources...
echo ==========================================

set "IMAGE_RES_DIR=%~dp0image_source\res"
set "ANDROID_RES_DIR=%~dp0android\app\src\main\res"

if not exist "%IMAGE_RES_DIR%" (
    echo.
    echo ERROR: Image resource folder not found:
    echo %IMAGE_RES_DIR%
    echo.
    echo Please place your converted res folder here:
    echo image_source\res
    goto :error
)

if not exist "%ANDROID_RES_DIR%" (
    echo.
    echo ERROR: Android res folder not found:
    echo %ANDROID_RES_DIR%
    goto :error
)

REM Copy drawable folders for splash images/backgrounds.
for %%D in (
    drawable
    drawable-v24
    drawable-land-hdpi
    drawable-land-mdpi
    drawable-land-xhdpi
    drawable-land-xxhdpi
    drawable-land-xxxhdpi
    drawable-port-hdpi
    drawable-port-mdpi
    drawable-port-xhdpi
    drawable-port-xxhdpi
    drawable-port-xxxhdpi
) do (
    if exist "%IMAGE_RES_DIR%\%%D" (
        echo Copying %%D ...
        if not exist "%ANDROID_RES_DIR%\%%D" mkdir "%ANDROID_RES_DIR%\%%D"
        xcopy /E /I /Y "%IMAGE_RES_DIR%\%%D\*" "%ANDROID_RES_DIR%\%%D\" >nul
        if errorlevel 1 goto :error
    )
)

REM Copy launcher icon mipmap folders.
for %%D in (
    mipmap-anydpi-v26
    mipmap-hdpi
    mipmap-mdpi
    mipmap-xhdpi
    mipmap-xxhdpi
    mipmap-xxxhdpi
) do (
    if exist "%IMAGE_RES_DIR%\%%D" (
        echo Copying %%D ...
        if not exist "%ANDROID_RES_DIR%\%%D" mkdir "%ANDROID_RES_DIR%\%%D"
        xcopy /E /I /Y "%IMAGE_RES_DIR%\%%D\*" "%ANDROID_RES_DIR%\%%D\" >nul
        if errorlevel 1 goto :error
    )
)

REM Copy icon background color only, without replacing app strings/styles.
if exist "%IMAGE_RES_DIR%\values\ic_launcher_background.xml" (
    echo Copying values\ic_launcher_background.xml ...
    if not exist "%ANDROID_RES_DIR%\values" mkdir "%ANDROID_RES_DIR%\values"
    copy /Y "%IMAGE_RES_DIR%\values\ic_launcher_background.xml" "%ANDROID_RES_DIR%\values\ic_launcher_background.xml" >nul
    if errorlevel 1 goto :error
)

echo Android icon and splash resources replaced.

REM ------------------------------------------------------------
REM Build debug APK.
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