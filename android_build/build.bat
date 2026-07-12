@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM  YouTube Music Player - Android APK Build Script
REM ============================================================

cd /d "%~dp0"

echo.
echo ==========================================
echo Checking Node.js / npm...
echo ==========================================

where npm >nul 2>&1
if errorlevel 1 (
    echo npm not found.
    echo Using portable Node.js inside this project...

    set "TOOLS_DIR=%~dp0tools"
    set "LOCAL_NODE_DIR=%~dp0tools\nodejs"
    set "LOCAL_NODE_EXE=%~dp0tools\nodejs\node.exe"
    set "LOCAL_NPM_CMD=%~dp0tools\nodejs\npm.cmd"

    if not exist "!LOCAL_NPM_CMD!" (
        echo.
        echo ==========================================
        echo Downloading latest Node.js LTS portable ZIP...
        echo ==========================================

        if not exist "!TOOLS_DIR!" mkdir "!TOOLS_DIR!"

        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "$ErrorActionPreference='Stop';" ^
            "$tools='!TOOLS_DIR!';" ^
            "$nodeDir='!LOCAL_NODE_DIR!';" ^
            "$index=Invoke-RestMethod 'https://nodejs.org/dist/index.json';" ^
            "$lts=$index | Where-Object { $_.lts -ne $false } | Select-Object -First 1;" ^
            "$version=$lts.version;" ^
            "$zipName='node-' + $version + '-win-x64.zip';" ^
            "$url='https://nodejs.org/dist/' + $version + '/' + $zipName;" ^
            "$zipPath=Join-Path $tools $zipName;" ^
            "Write-Host ('Downloading ' + $url);" ^
            "Invoke-WebRequest -Uri $url -OutFile $zipPath;" ^
            "if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force };" ^
            "Expand-Archive -Force $zipPath -DestinationPath $tools;" ^
            "$extracted=Join-Path $tools ('node-' + $version + '-win-x64');" ^
            "Move-Item $extracted $nodeDir;" ^
            "Remove-Item $zipPath -Force;"

        if errorlevel 1 goto :error
    )

    if not exist "!LOCAL_NPM_CMD!" (
        echo.
        echo ERROR: Portable npm was not found:
        echo !LOCAL_NPM_CMD!
        goto :error
    )

    set "PATH=!LOCAL_NODE_DIR!;!PATH!"

    echo.
    echo Portable Node.js ready:
    call node -v
    call npm -v
)

echo.
echo ==========================================
echo Installing Node.js dependencies...
echo ==========================================

REM Reinstall when node_modules is missing or when the native export/import
REM plugins were not installed by an older project build.
set "NEED_NPM_INSTALL=0"
if not exist "node_modules" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capacitor\filesystem" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capacitor\share" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capawesome\capacitor-file-picker" set "NEED_NPM_INSTALL=1"

if "!NEED_NPM_INSTALL!"=="1" (
    echo Installing Node.js dependencies...

    if exist "package-lock.json" (
        call npm ci
    ) else (
        call npm install
    )

    if errorlevel 1 goto :error
) else (
    echo Required Node.js dependencies are already installed.
)

REM ------------------------------------------------------------
REM Download and use portable Java JDK 21 for Capacitor 7.
REM Installs into:
REM android_build\tools\jdk-21
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Checking Java JDK 21...
echo ==========================================

set "LOCAL_JDK_DIR=%~dp0tools\jdk-21"
set "LOCAL_JAVA_EXE=%~dp0tools\jdk-21\bin\java.exe"

if not exist "%LOCAL_JAVA_EXE%" (
    echo Java JDK 21 was not found.
    echo Downloading Eclipse Temurin JDK 21...

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ErrorActionPreference='Stop';" ^
        "$tools=[IO.Path]::GetFullPath('%~dp0tools');" ^
        "$jdk=Join-Path $tools 'jdk-21';" ^
        "$zip=Join-Path $tools 'temurin-jdk21.zip';" ^
        "$extract=Join-Path $tools 'jdk21-extract';" ^
        "New-Item -ItemType Directory -Force -Path $tools | Out-Null;" ^
        "if (Test-Path $jdk) { Remove-Item $jdk -Recurse -Force };" ^
        "if (Test-Path $extract) { Remove-Item $extract -Recurse -Force };" ^
        "if (Test-Path $zip) { Remove-Item $zip -Force };" ^
        "Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $zip;" ^
        "Expand-Archive -Force $zip -DestinationPath $extract;" ^
        "$root=Get-ChildItem $extract -Directory | Select-Object -First 1;" ^
        "if (-not $root) { throw 'The downloaded JDK archive was empty.' };" ^
        "Move-Item -Path $root.FullName -Destination $jdk;" ^
        "Remove-Item $extract -Recurse -Force;" ^
        "Remove-Item $zip -Force;"

    if errorlevel 1 goto :error
)

if not exist "%LOCAL_JAVA_EXE%" (
    echo.
    echo ERROR: Java JDK 21 installation failed.
    echo Expected Java executable:
    echo %LOCAL_JAVA_EXE%
    goto :error
)

set "JAVA_HOME=%LOCAL_JDK_DIR%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo.
echo Java selected:
echo JAVA_HOME=%JAVA_HOME%
java -version
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Download Android SDK automatically if local SDK is missing.
REM Installs into:
REM android_build\android-sdk
REM ------------------------------------------------------------
set "NEED_SDK_INSTALL=0"

if not exist "%~dp0android-sdk\platform-tools\adb.exe" set "NEED_SDK_INSTALL=1"
if not exist "%~dp0android-sdk\platforms\android-35\android.jar" set "NEED_SDK_INSTALL=1"
if not exist "%~dp0android-sdk\build-tools\35.0.0\aapt2.exe" set "NEED_SDK_INSTALL=1"

if "%NEED_SDK_INSTALL%"=="1" (
    echo.
    echo ==========================================
    echo Android SDK not found. Downloading SDK...
    echo ==========================================

    set "SDK_DIR=%~dp0android-sdk"
    set "SDKMANAGER=!SDK_DIR!\cmdline-tools\latest\bin\sdkmanager.bat"

    if not exist "!SDK_DIR!\cmdline-tools" mkdir "!SDK_DIR!\cmdline-tools"

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ErrorActionPreference='Stop';" ^
        "$sdk='!SDK_DIR!';" ^
        "New-Item -ItemType Directory -Force -Path (Join-Path $sdk 'cmdline-tools') | Out-Null;" ^
        "Set-Location $sdk;" ^
        "Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip' -OutFile 'cmdline-tools.zip';" ^
        "Expand-Archive -Force 'cmdline-tools.zip' -DestinationPath 'cmdline-tools';" ^
        "if (Test-Path '.\cmdline-tools\latest') { Remove-Item '.\cmdline-tools\latest' -Recurse -Force };" ^
        "if (Test-Path '.\cmdline-tools\cmdline-tools') { Move-Item '.\cmdline-tools\cmdline-tools' '.\cmdline-tools\latest' };" ^
        "Remove-Item 'cmdline-tools.zip' -Force;"

    if errorlevel 1 goto :error

    if not exist "!SDKMANAGER!" (
        echo.
        echo ERROR: sdkmanager.bat was not found:
        echo !SDKMANAGER!
        goto :error
    )

    echo.
    echo ==========================================
    echo Accepting Android SDK licenses...
    echo ==========================================

    cmd /c "for /l %%i in (1,1,100) do @echo y" | call "!SDKMANAGER!" --sdk_root="!SDK_DIR!" --licenses
    if errorlevel 1 goto :error

    echo.
    echo ==========================================
    echo Installing Android SDK packages...
    echo ==========================================

    call "!SDKMANAGER!" --sdk_root="!SDK_DIR!" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
    if errorlevel 1 goto :error

    echo.
    echo Android SDK installed successfully:
    echo !SDK_DIR!
)

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
set "ANDROID_HOME=%SDK_DIR%"
set "ANDROID_SDK_ROOT=%SDK_DIR%"
set "PATH=%SDK_DIR%\platform-tools;%SDK_DIR%\cmdline-tools\latest\bin;%PATH%"

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
    echo Image resource folder not found. Skipping icon replacement.
    goto :skip_icon_replace
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

:skip_icon_replace
REM ------------------------------------------------------------
REM Build debug APK.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Building debug APK...
echo ==========================================

cd /d "%~dp0android"

REM Stop any Gradle daemon that was started with an older Java version.
call gradlew.bat --stop >nul 2>&1

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