# YouTube Music Player APK

This folder wraps the web app with Capacitor so it can be built as an Android APK.

## Auto Build
```powershell
./build.bat
```

## Manual Build

```powershell
cd android_build

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
    $lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1

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
    Move-Item $extractedDir $nodeDir

    Remove-Item $zipPath -Force

    $env:PATH = "$nodeDir;$env:PATH"
}

node -v
npm -v

# ============================================================
# 2. Install Node.js dependencies
# ============================================================

npm install

# ============================================================
# 3. Download and install Android SDK locally
# ============================================================

$ErrorActionPreference = "Stop"

$sdk = Join-Path (Get-Location) "android-sdk"
$cmdlineToolsDir = Join-Path $sdk "cmdline-tools"
$latestDir = Join-Path $cmdlineToolsDir "latest"
$sdkManager = Join-Path $latestDir "bin\sdkmanager.bat"

if (-not (Test-Path $sdkManager)) {
    Write-Host "Android SDK command line tools not found. Downloading..."

    New-Item -ItemType Directory -Force -Path $cmdlineToolsDir | Out-Null

    Push-Location $sdk

    Invoke-WebRequest `
        -Uri "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip" `
        -OutFile "cmdline-tools.zip"

    Expand-Archive -Force "cmdline-tools.zip" -DestinationPath "cmdline-tools"

    if (Test-Path ".\cmdline-tools\latest") {
        Remove-Item ".\cmdline-tools\latest" -Recurse -Force
    }

    Move-Item ".\cmdline-tools\cmdline-tools" ".\cmdline-tools\latest"

    Remove-Item "cmdline-tools.zip" -Force

    Pop-Location
}

# Set Android SDK environment for this PowerShell session
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$env:PATH"

# Accept licenses
cmd /c "for /l %i in (1,1,100) do @echo y" | & $sdkManager --sdk_root="$sdk" --licenses

# Install required SDK packages
& $sdkManager --sdk_root="$sdk" `
    "platform-tools" `
    "platforms;android-35" `
    "build-tools;35.0.0"

# ============================================================
# 4. Add Android platform if missing
# ============================================================

if (-not (Test-Path ".\android")) {
    npx cap add android
}
else {
    Write-Host "Android platform already exists."
}

# ============================================================
# 5. Create android/local.properties
# ============================================================

$sdkForGradle = $sdk.Replace("\", "\\")
"sdk.dir=$sdkForGradle" | Set-Content -Encoding ASCII ".\android\local.properties"

Get-Content ".\android\local.properties"

# ============================================================
# 6. Sync Capacitor files
# ============================================================

npx cap sync android

# ============================================================
# 7. Build APK
# ============================================================

cd android

.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

The debug APK will be created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Clean Folder
```powershell
./clean.bat
```

The app still needs internet access for YouTube playback, YouTube search, lyrics, translation, and CDN-hosted styles/scripts.
