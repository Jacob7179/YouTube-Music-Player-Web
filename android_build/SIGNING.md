# Custom Android APK signing

Run `android_build\build.bat` and choose **2** to build a release APK signed with your own Android keystore. Choose **1** to keep the original debug build workflow.

## Create a keystore (first time only)

From the `android_build` directory, run this with the Java `keytool` installed (the build script also installs Java 21 into `tools\jdk-21`):

```bat
mkdir signing
tools\jdk-21\bin\keytool.exe -genkeypair -v -keystore signing\release-key.jks -alias musicplayer -keyalg RSA -keysize 3072 -validity 10000
```

Keep the keystore **outside** `android_build\android`, which is deleted and recreated on each build. Store a **secure backup** of the keystore and its alias/passwords. If lost, you cannot sign updates for an APK installed with the old key.

For signed builds, the signing helper opens a Windows file picker to select your existing `.jks` or `.keystore` file, then asks for the alias and passwords. If the file picker is unavailable, you can enter the path manually. Passwords are not saved to the source code.

Output: `android_build\android\app\build\outputs\apk\release\app-release-signed.apk`

A release-signed APK cannot update an already installed debug APK because the signing certificates are different. Uninstall the debug version first (back up app data before uninstalling), or install a release APK that matches the existing signing key. Future updates require the same keystore and a higher `versionCode`.

Do **not** commit `signing\*.jks` or signing passwords to Git.
