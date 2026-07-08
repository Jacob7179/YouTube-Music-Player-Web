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
