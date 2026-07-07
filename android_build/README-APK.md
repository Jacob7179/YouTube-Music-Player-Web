# YouTube Music Player APK

This folder wraps the web app with Capacitor so it can be built as an Android APK.

## Build

```powershell
npm install
npx cap add android
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The debug APK will be created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The app still needs internet access for YouTube playback, YouTube search, lyrics, translation, and CDN-hosted styles/scripts.
