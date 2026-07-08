# YouTube Music Player APK

This folder wraps the web app with Capacitor so it can be built as an Android APK.

## Auto Build
```powershell
./build.bat
```

## Manual Build

```powershell
cd android_build
npm install

$ErrorActionPreference='Stop'; $sdk=Join-Path (Get-Location) 'android-sdk'; New-Item -ItemType Directory -Force -Path "$sdk\cmdline-tools" | Out-Null; Set-Location $sdk; Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip" -OutFile "cmdline-tools.zip"; Expand-Archive -Force "cmdline-tools.zip" -DestinationPath "cmdline-tools"; if (Test-Path ".\cmdline-tools\latest") { Remove-Item ".\cmdline-tools\latest" -Recurse -Force }; Move-Item ".\cmdline-tools\cmdline-tools" ".\cmdline-tools\latest"; Remove-Item "cmdline-tools.zip"; cmd /c "for /l %i in (1,1,100) do @echo y" | & ".\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$($PWD.Path)" --licenses; & ".\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$($PWD.Path)" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

cd ..

npx cap add android
npx cap sync android

$sdk = (Get-Location).Path.Replace('\', '\\') + '\\android-sdk'
"sdk.dir=$sdk" | Set-Content -Encoding ASCII .\android\local.properties

cd android
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
