# YouTube Music Player APK

This folder wraps the web app with Capacitor so it can be built as an Android APK.

## Requirements

The build uses:

- Node.js and npm
- Java JDK 21
- Android SDK Platform 35
- Android Build Tools 35.0.0
- Capacitor 7
- Capacitor File Picker 7.2.0

The automatic and manual setup below install portable copies of missing tools inside the `android_build` folder. They do not require a system-wide Java or Android SDK installation.

## Auto Build

```powershell
cd android_build
.\build.bat
```

## Manual Build

Open PowerShell in the folder containing `android_build`, then run the complete script below.

```powershell
cd android_build

$ErrorActionPreference = "Stop"

# ============================================================
# 1. Check Node.js / npm
#    If npm is missing, download portable Node.js locally
# ============================================================

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm not found. Downloading portable Node.js..."

    $toolsDir = Join-Path (Get-Location) "tools"
    $nodeDir = Join-Path $toolsDir "nodejs"

    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

    $index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $lts = $index |
        Where-Object { $_.lts -ne $false } |
        Select-Object -First 1

    if (-not $lts) {
        throw "Unable to find the latest Node.js LTS version."
    }

    $version = $lts.version
    $zipName = "node-$version-win-x64.zip"
    $url = "https://nodejs.org/dist/$version/$zipName"
    $zipPath = Join-Path $toolsDir $zipName

    Invoke-WebRequest -Uri $url -OutFile $zipPath

    if (Test-Path $nodeDir) {
        Remove-Item $nodeDir -Recurse -Force
    }

    Expand-Archive -Force $zipPath -DestinationPath $toolsDir

    $extractedDir = Join-Path $toolsDir "node-$version-win-x64"

    if (-not (Test-Path $extractedDir)) {
        throw "The downloaded Node.js archive could not be extracted."
    }

    Move-Item $extractedDir $nodeDir
    Remove-Item $zipPath -Force

    $env:PATH = "$nodeDir;$env:PATH"
}

Write-Host ""
Write-Host "Node.js version:"
node -v

Write-Host "npm version:"
npm -v

# ============================================================
# 2. Install Node.js dependencies and native file plugins
# ============================================================

npm install

# These native plugins are required by the Android export function.
# Keeping them on major version 7 matches Capacitor 7.
npm install @capacitor/filesystem@7 @capacitor/share@7 @capawesome/capacitor-file-picker@7.2.0

# ============================================================
# 3. Download and select portable Java JDK 21
# ============================================================

$toolsDir = Join-Path (Get-Location) "tools"
$jdkDir = Join-Path $toolsDir "jdk-21"
$javaExe = Join-Path $jdkDir "bin\java.exe"

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

if (-not (Test-Path $javaExe)) {
    Write-Host "Java JDK 21 not found. Downloading Eclipse Temurin JDK 21..."

    $jdkZip = Join-Path $toolsDir "temurin-jdk21.zip"
    $jdkExtractDir = Join-Path $toolsDir "jdk21-extract"

    if (Test-Path $jdkDir) {
        Remove-Item $jdkDir -Recurse -Force
    }

    if (Test-Path $jdkExtractDir) {
        Remove-Item $jdkExtractDir -Recurse -Force
    }

    if (Test-Path $jdkZip) {
        Remove-Item $jdkZip -Force
    }

    Invoke-WebRequest `
        -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse" `
        -OutFile $jdkZip

    Expand-Archive -Force $jdkZip -DestinationPath $jdkExtractDir

    $extractedJdk = Get-ChildItem $jdkExtractDir -Directory |
        Select-Object -First 1

    if (-not $extractedJdk) {
        throw "The downloaded JDK archive did not contain a JDK folder."
    }

    Move-Item $extractedJdk.FullName $jdkDir

    Remove-Item $jdkExtractDir -Recurse -Force
    Remove-Item $jdkZip -Force
}

if (-not (Test-Path $javaExe)) {
    throw "Java JDK 21 installation failed. Missing: $javaExe"
}

# Use JDK 21 for this PowerShell session and for Gradle.
$env:JAVA_HOME = $jdkDir
$env:PATH = "$jdkDir\bin;$env:PATH"

Write-Host ""
Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "Java version:"
& $javaExe -version

# ============================================================
# 4. Download and install Android SDK locally
# ============================================================

$sdk = Join-Path (Get-Location) "android-sdk"
$cmdlineToolsDir = Join-Path $sdk "cmdline-tools"
$latestDir = Join-Path $cmdlineToolsDir "latest"
$sdkManager = Join-Path $latestDir "bin\sdkmanager.bat"

if (-not (Test-Path $sdkManager)) {
    Write-Host "Android SDK command-line tools not found. Downloading..."

    New-Item -ItemType Directory -Force -Path $cmdlineToolsDir |
        Out-Null

    $commandLineToolsZip = Join-Path $sdk "cmdline-tools.zip"

    Invoke-WebRequest `
        -Uri "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip" `
        -OutFile $commandLineToolsZip

    Expand-Archive `
        -Force `
        $commandLineToolsZip `
        -DestinationPath $cmdlineToolsDir

    $downloadedToolsDir = Join-Path $cmdlineToolsDir "cmdline-tools"

    if (-not (Test-Path $downloadedToolsDir)) {
        throw "The Android command-line tools archive could not be extracted."
    }

    if (Test-Path $latestDir) {
        Remove-Item $latestDir -Recurse -Force
    }

    Move-Item $downloadedToolsDir $latestDir
    Remove-Item $commandLineToolsZip -Force
}

if (-not (Test-Path $sdkManager)) {
    throw "Android sdkmanager was not found at: $sdkManager"
}

# Set Android SDK environment variables for this PowerShell session.
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$env:PATH"

Write-Host ""
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"

# Accept Android SDK licences.
cmd /c "for /l %i in (1,1,100) do @echo y" |
    & $sdkManager --sdk_root="$sdk" --licenses

# Install the required Android SDK packages.
& $sdkManager `
    --sdk_root="$sdk" `
    "platform-tools" `
    "platforms;android-35" `
    "build-tools;35.0.0"

# ============================================================
# 5. Add the Android platform if it is missing
# ============================================================

if (-not (Test-Path ".\android")) {
    npx cap add android
}
else {
    Write-Host "Android platform already exists."
}

# ============================================================
# 6. Create android/local.properties
# ============================================================

$sdkForGradle = $sdk.Replace("\", "\\")
"sdk.dir=$sdkForGradle" |
    Set-Content -Encoding ASCII ".\android\local.properties"

Write-Host ""
Write-Host "android/local.properties:"
Get-Content ".\android\local.properties"

# ============================================================
# 7. Sync web files and Capacitor plugins with Android
# ============================================================

npx cap sync android

# ============================================================
# 8. Stop old Gradle daemons and build the debug APK
# ============================================================

Set-Location ".\android"

# Stop a daemon that may have been started with an older Java version.
.\gradlew.bat --stop

.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

The debug APK will be created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Verify Java Used by Gradle

From the `android_build\android` folder, run:

```powershell
.\gradlew.bat --version
```

The output should show Java 21, for example:

```text
JVM: 21
```

If it shows Java 17 or an older version, return to the `android_build` folder and set the portable JDK again:

```powershell
$jdkDir = Join-Path (Get-Location) "tools\jdk-21"
$env:JAVA_HOME = $jdkDir
$env:PATH = "$jdkDir\bin;$env:PATH"

cd android
.\gradlew.bat --stop
.\gradlew.bat --version
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

## Common Java 21 Error

This error means Gradle cannot find Java 21:

```text
Cannot find a Java installation on your machine matching this task's
requirements: {languageVersion=21}
```

Run the **Manual Build** commands from the beginning. The JDK section downloads Java 21 into:

```text
android_build/tools/jdk-21
```

It then sets `JAVA_HOME` before Gradle starts.

## Clean Folder

```powershell
.\clean.bat
```

The app still needs internet access for YouTube playback, YouTube search, lyrics, translation, and CDN-hosted styles or scripts.
