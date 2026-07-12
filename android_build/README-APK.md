# YouTube Music Player APK

This folder wraps the web app with Capacitor so it can be built and installed as an Android APK.

## Requirements

The Android project uses:

- Node.js and npm
- Java JDK 21
- Android SDK Platform 35
- Android Build Tools 35.0.0
- Capacitor 7
- Capacitor Filesystem 7
- Capacitor Share 7
- Capawesome File Picker 7.2.0
- Capgo Media Session 7.3.0

The automatic build uses portable tools stored inside the `android_build` folder. A system-wide Java or Android SDK installation is not required.

## Project Structure

Important folders and files:

```text
android_build/
├─ android/                 Generated native Android project
├─ android-sdk/             Portable Android SDK
├─ tools/
│  ├─ jdk-21/              Portable Java JDK 21
│  └─ nodejs/              Portable Node.js when required
├─ www/                     Web files copied into the Android app
├─ image_source/
│  └─ res/                  Android icon and splash resources
├─ build.bat                Automatic APK build
├─ clean.bat                Build-folder cleanup
├─ capacitor.config.json    Capacitor configuration
├─ package.json             Node.js dependencies
└─ package-lock.json        Locked dependency versions
```

Keep `package-lock.json` in Git so the same dependency versions can be installed on different computers.

## Automatic Build

Open PowerShell or Command Prompt in the repository folder and run:

```powershell
cd android_build
.\build.bat
```

The script will:

1. Check or install Node.js.
2. Install dependencies from `package-lock.json`.
3. Check or install Java JDK 21.
4. Check or install the Android SDK.
5. Add the Android platform when it is missing.
6. Create `android/local.properties`.
7. Sync the web files and Capacitor plugins.
8. Configure native Android media controls and foreground media playback permission.
9. Replace the Android icon and splash resources using `image_source\res`.
10. Build the debug APK.

The generated APK will be located at:

```text
android_build/android/app/build/outputs/apk/debug/app-debug.apk
```

## Quick Rebuild After Editing Web Files

This is an optional faster rebuild method. Use it only after `build.bat` has completed successfully at least once and the `android`, `android-sdk`, and `tools` folders already exist.

Use this section when you only changed web files such as HTML, CSS, JavaScript, images, or other content inside `www`. It syncs the updated web files into the existing Android project and rebuilds the APK without downloading the tools or reinstalling all dependencies.

You may run `build.bat` instead at any time if you prefer the complete automatic process.

After changing files inside `www`, run:

```powershell
cd android_build

$env:JAVA_HOME = (Resolve-Path ".\tools\jdk-21")
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = (Resolve-Path ".\android-sdk")
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

npx cap sync android

cd android
.\gradlew.bat assembleDebug
```

The updated APK will be created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Verify the Java Version Used by Gradle

From the `android_build\android` folder, run:

```powershell
.\gradlew.bat --version
```

The output should show Java 21, for example:

```text
JVM: 21
```

If it shows Java 17 or an older version, run:

```powershell
cd android_build

$env:JAVA_HOME = (Resolve-Path ".\tools\jdk-21")
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

cd android
.\gradlew.bat --stop
.\gradlew.bat --version
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

## Install the Debug APK with ADB

Enable Developer Options and USB debugging on the Android device, connect it to the computer, and run:

```powershell
cd android_build
.\android-sdk\platform-tools\adb.exe devices
.\android-sdk\platform-tools\adb.exe install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

The `-r` option replaces the installed debug version while keeping its application data.

## Native Playlist Import and Export

The Android app uses these native plugins:

```text
@capacitor/filesystem
@capacitor/share
@capawesome/capacitor-file-picker
@capgo/capacitor-media-session
```

After adding or changing a native plugin, always run:

```powershell
npm install
npx cap sync android
```

Then rebuild the APK.

GitHub Pages, Vercel, and normal browsers continue using the browser-based import and download functions.

## System Media Controls

The project supports system play, pause, previous, next, seek, metadata, and playback-position controls through two paths:

- Windows, macOS, Android browsers, and Safari use the browser Media Session API when supported.
- The Capacitor app uses `@capgo/capacitor-media-session` for Android notification, lock-screen, headset, and system media controls. The same JavaScript adapter can also use the plugin in a future Capacitor iOS build.

The application playlist remains managed by JavaScript. Operating systems do not provide one universal cross-platform API for publishing the complete queue, but their previous and next controls now call the real playlist array instead of the currently filtered HTML list.

After changing media-session dependencies, run `build.bat` so Capacitor synchronizes the native plugin.

## Android Background Playback

The APK build now applies Android-specific background playback support automatically:

- A custom Capacitor WebView prevents embedded YouTube playback from being stopped only because the app window becomes hidden.
- Capacitor `KeepRunning` is explicitly enabled so JavaScript timers remain active after pressing Home or locking the screen.
- The native media-session foreground service stays active during playback and holds a partial wake lock only while the song is playing.
- Android 13 and newer request notification permission so play, pause, previous, and next controls can be shown.

Run `build.bat`, install the newly generated APK, start a song once inside the app, and grant notification permission when Android asks. Playback should then continue when the screen is locked or another app is opened.

Force stopping the app or swiping it away on devices that terminate the WebView will still end playback because the YouTube player remains an embedded web player rather than a native audio stream. Some manufacturers may also require setting the app battery mode to **Unrestricted**.

The build applies these files after every Capacitor sync:

```text
scripts/configure-android-background-playback.js
scripts/patch-media-session-plugin.js
```

## Android Play/Pause Media Control Fix

The build runs `scripts\patch-media-session-plugin.js` after installing dependencies. This corrects the Android notification Play and Pause PendingIntent actions used by `@capgo/capacitor-media-session` 7.3.0.

Do not remove the patch script or the `postinstall` entry from `package.json`. After changing dependencies, run:

```powershell
npm ci
npx cap sync android
```

Then rebuild and reinstall the APK.

## Common Errors

### Java 21 is missing

```text
Cannot find a Java installation on your machine matching this task's
requirements: {languageVersion=21}
```

Run `build.bat` again. The portable JDK should exist at:

```text
android_build/tools/jdk-21
```

Then stop the old Gradle daemon and rebuild.

### Android SDK location is missing

```text
SDK location not found
```

Confirm that this file exists:

```text
android_build/android/local.properties
```

Its content should point to the local SDK, for example:

```text
sdk.dir=C:\\path\\to\\android_build\\android-sdk
```

### A Capacitor plugin is missing

Run:

```powershell
cd android_build
npm ci
npx cap sync android
```

Then rebuild the APK.

### The tools folder cannot be deleted

The OpenJDK Platform binary or a Gradle daemon may still be using the portable JDK.

Run:

```powershell
cd android_build\android
.\gradlew.bat --stop
```

Then run `clean.bat` again. The current cleanup script also attempts to stop Java and Node.js processes launched from the project's `tools` folder.

### flatDir warnings

Messages such as this are warnings, not build failures:

```text
WARNING: Using flatDir should be avoided because it doesn't support any meta-data formats.
```

Check the final Gradle error below the warnings to identify the real cause.

## Clean Generated Folders

Run:

```powershell
cd android_build
.\clean.bat
```

The cleanup script removes generated build folders and asks before deleting `android-sdk`. Keeping `android-sdk` makes the next build faster.

## Internet Requirement

The app still requires internet access for:

- YouTube playback
- YouTube search
- Lyrics
- Translation
- CDN-hosted styles or scripts

## Earphone Multi-click Controls

The Android build patches the media-session callback to recognize the central button on common wired earphones:

```text
1 tap  = Play or pause
2 taps = Next song
3 taps = Previous song
```

The three taps must be reasonably quick. A single or double-tap action waits briefly so the app can determine whether another tap follows. Re-run `build.bat` after changing or reinstalling npm dependencies so the native plugin patch is applied again.
