@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM  YouTube Music Player - Android APK Build Script
REM ============================================================

cd /d "%~dp0"

REM Android application version applied to android\app\build.gradle.
set "ANDROID_VERSION_CODE=2"
set "ANDROID_VERSION_NAME=1.0.1-beta"

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

REM Reinstall when node_modules is missing, incomplete, or was created
REM from a different package-lock.json.
set "NEED_NPM_INSTALL=0"
set "CURRENT_LOCK_HASH="
set "INSTALLED_LOCK_HASH="

if exist "package-lock.json" (
    for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash"`) do set "CURRENT_LOCK_HASH=%%H"
)

if not exist "node_modules" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capacitor\filesystem" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capacitor\share" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capawesome\capacitor-file-picker" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\@capgo\capacitor-media-session" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\.ytmp-package-lock-sha256" set "NEED_NPM_INSTALL=1"

if exist "node_modules\.ytmp-package-lock-sha256" (
    set /p "INSTALLED_LOCK_HASH=" < "node_modules\.ytmp-package-lock-sha256"
)

if defined CURRENT_LOCK_HASH if /i not "!CURRENT_LOCK_HASH!"=="!INSTALLED_LOCK_HASH!" set "NEED_NPM_INSTALL=1"

if "!NEED_NPM_INSTALL!"=="1" (
    echo Installing Node.js dependencies...

    REM Ensure this project never uses a registry URL saved by another environment.
    call npm config set registry https://registry.npmjs.org/ --location=project
    if errorlevel 1 goto :error

    REM Gradle may keep Capacitor plugin source files open on Windows.
    REM Stop its daemon before npm removes and recreates node_modules.
    if exist "android\gradlew.bat" (
        call "android\gradlew.bat" --stop >nul 2>&1
    )

    if exist "node_modules" (
        echo Removing old node_modules...
        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "$ErrorActionPreference='Stop';" ^
            "$path=[IO.Path]::GetFullPath('node_modules');" ^
            "$removed=$false;" ^
            "for($attempt=1; $attempt -le 5; $attempt++){" ^
            "  try {" ^
            "    if(Test-Path -LiteralPath $path){ Remove-Item -LiteralPath $path -Recurse -Force };" ^
            "    $removed=$true; break;" ^
            "  } catch {" ^
            "    Write-Host ('Cleanup attempt ' + $attempt + ' failed: ' + $_.Exception.Message);" ^
            "    Start-Sleep -Seconds 2;" ^
            "  }" ^
            "};" ^
            "if(-not $removed){ throw 'node_modules is locked. Close Android Studio, File Explorer windows opened inside node_modules, and any running Java/Gradle/Node processes, then run build.bat again.' }"
        if errorlevel 1 goto :error
    )

    if exist "package-lock.json" (
        call npm ci --registry=https://registry.npmjs.org/ --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000
        if errorlevel 1 (
            echo.
            echo First npm install attempt failed. Verifying cache and retrying...
            call npm cache verify
            call npm ci --registry=https://registry.npmjs.org/ --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000
        )
    ) else (
        call npm install --registry=https://registry.npmjs.org/ --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000
    )

    if errorlevel 1 goto :error

    if defined CURRENT_LOCK_HASH (
        > "node_modules\.ytmp-package-lock-sha256" echo !CURRENT_LOCK_HASH!
    )
) else (
    echo Required Node.js dependencies are already installed.
)

echo.
echo ==========================================
echo Applying Android media control patch...
echo ==========================================
call node scripts\patch-media-session-plugin.js
if errorlevel 1 goto :error

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
REM Generate a stable Android "Last Updated" date from the latest
REM source change. This avoids WebView treating APK install time as
REM the modification date on every build or launch.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Generating Android last updated date...
echo ==========================================
call node scripts\generate-build-date.js
if errorlevel 1 goto :error

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
REM Set the Android app version in android\app\build.gradle.
REM This runs after Capacitor sync so it works for both newly created
REM and existing Android projects.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Setting Android app version...
echo ==========================================

set "APP_BUILD_GRADLE=%~dp0android\app\build.gradle"

if not exist "%APP_BUILD_GRADLE%" (
    echo ERROR: Android app build.gradle was not found:
    echo %APP_BUILD_GRADLE%
    goto :error
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$path='%APP_BUILD_GRADLE%';" ^
    "$content=Get-Content -LiteralPath $path -Raw;" ^
    "$versionCodePattern='(?m)^(\s*)versionCode\s+\d+\s*$';" ^
    "$versionNamePattern='(?m)^(\s*)versionName\s+.+$';" ^
    "if(-not [regex]::IsMatch($content,$versionCodePattern)){ throw 'versionCode was not found in android\app\build.gradle.' };" ^
    "if(-not [regex]::IsMatch($content,$versionNamePattern)){ throw 'versionName was not found in android\app\build.gradle.' };" ^
    "$content=[regex]::Replace($content,$versionCodePattern,'${1}versionCode %ANDROID_VERSION_CODE%',1);" ^
    "$versionNameReplacement='${1}versionName ' + [char]34 + '%ANDROID_VERSION_NAME%' + [char]34;" ^
    "$content=[regex]::Replace($content,$versionNamePattern,$versionNameReplacement,1);" ^
    "$content=$content.TrimStart([char]0xFEFF);" ^
    "$utf8NoBom=New-Object System.Text.UTF8Encoding($false);" ^
    "[System.IO.File]::WriteAllText($path,$content,$utf8NoBom);"
if errorlevel 1 goto :error

echo versionCode %ANDROID_VERSION_CODE%
echo versionName "%ANDROID_VERSION_NAME%"

echo.
echo ==========================================
echo Configuring Android background playback...
echo ==========================================
call node scripts\configure-android-background-playback.js
if errorlevel 1 goto :error

REM ------------------------------------------------------------
REM Add the Android 14+ foreground media playback permission.
REM The native media session plugin uses a mediaPlayback foreground
REM service for notification, lock-screen and headset controls.
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Configuring Android media controls...
echo ==========================================

set "APP_MANIFEST=%~dp0android\app\src\main\AndroidManifest.xml"

if not exist "%APP_MANIFEST%" (
    echo ERROR: AndroidManifest.xml was not found:
    echo %APP_MANIFEST%
    goto :error
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$path='%APP_MANIFEST%';" ^
    "$content=Get-Content -LiteralPath $path -Raw;" ^
    "$permission='<uses-permission android:name=' + [char]34 + 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK' + [char]34 + ' />';" ^
    "if ($content -notmatch 'FOREGROUND_SERVICE_MEDIA_PLAYBACK') {" ^
    "  $content=$content -replace '</manifest>', ('    ' + $permission + [Environment]::NewLine + '</manifest>');" ^
    "  Set-Content -LiteralPath $path -Value $content -Encoding UTF8 -NoNewline;" ^
    "}"
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
REM Prevent the splash image from being stretched into the top
REM app title area while keeping the "YouTube Music Player" text.
REM Changes only AppTheme.NoActionBarLaunch:
REM android:background -> android:windowBackground
REM ------------------------------------------------------------
echo.
echo ==========================================
echo Configuring Android splash window...
echo ==========================================

set "APP_STYLES=%~dp0android\app\src\main\res\values\styles.xml"

if not exist "%APP_STYLES%" (
    echo ERROR: Android styles.xml was not found:
    echo %APP_STYLES%
    goto :error
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$path='%APP_STYLES%';" ^
    "$content=Get-Content -LiteralPath $path -Raw;" ^
    "$stylePattern='(?s)(<style\s+name=' + [char]34 + 'AppTheme\.NoActionBarLaunch' + [char]34 + '[^>]*>)(.*?)(</style>)';" ^
    "$match=[regex]::Match($content,$stylePattern);" ^
    "if(-not $match.Success){ throw 'AppTheme.NoActionBarLaunch was not found in styles.xml.' };" ^
    "$opening=$match.Groups[1].Value;" ^
    "$body=$match.Groups[2].Value;" ^
    "$closing=$match.Groups[3].Value;" ^
    "$oldPattern='(?m)^(\s*)<item\s+name=' + [char]34 + 'android:background' + [char]34 + '>\s*@drawable/splash\s*</item>\s*$';" ^
    "$newPattern='<item\s+name=' + [char]34 + 'android:windowBackground' + [char]34 + '>\s*@drawable/splash\s*</item>';" ^
    "if([regex]::IsMatch($body,$oldPattern)){" ^
    "  $body=[regex]::Replace($body,$oldPattern,('${1}<item name=' + [char]34 + 'android:windowBackground' + [char]34 + '>@drawable/splash</item>'),1);" ^
    "} elseif(-not [regex]::IsMatch($body,$newPattern)){" ^
    "  $indent='        ';" ^
    "  $body=$body.TrimEnd() + [Environment]::NewLine + $indent + '<item name=' + [char]34 + 'android:windowBackground' + [char]34 + '>@drawable/splash</item>' + [Environment]::NewLine + '    ';" ^
    "};" ^
    "$replacement=$opening+$body+$closing;" ^
    "$content=$content.Substring(0,$match.Index)+$replacement+$content.Substring($match.Index+$match.Length);" ^
    "$content=$content.TrimStart([char]0xFEFF);" ^
    "$utf8NoBom=New-Object System.Text.UTF8Encoding($false);" ^
    "[System.IO.File]::WriteAllText($path,$content,$utf8NoBom);"
if errorlevel 1 goto :error

echo Splash window configured. App title text is kept.

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