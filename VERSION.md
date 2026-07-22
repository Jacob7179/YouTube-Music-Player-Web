# Version Information

## Current Versions

| Component | Version |
|---|---:|
| Web application | `1.6.1` |
| Android application | `1.0.1` |
| Android version code | `2` |

## Files to Update for a New Release

### 1. Web Version — `index.html`

Update the version displayed in the **Version Information** section:

```html
<small data-translate="version">Version: </small><small>1.6.1</small><br>
```

Files used by this project:

- `index.html` — version shown on the website.
- `android_build/www/index.html` — version shown inside the Android application.

Keep both files on the same web version unless the Android package intentionally uses a different web build.

### 2. Android Cache Version — `android_build/www/sw.js`

Update `CACHE_NAME` whenever releasing a new Android web bundle:

```javascript
const CACHE_NAME = "youtube-music-player-v1.0.1";
```

Changing the cache name makes the service worker discard the previous app-shell cache and store the files from the new release.

### 3. Android Application Version — `android_build/build.bat`

Update these values near the top of the file:

```bat
set "ANDROID_VERSION_CODE=2"
set "ANDROID_VERSION_NAME=1.0.1"
```

- `ANDROID_VERSION_NAME` is the version visible to users.
- `ANDROID_VERSION_CODE` is the internal Android release number. Increase it for every newer APK or Play Store release, even when only the version name changes slightly.

## Current Release Values

The following files are currently configured for this release:

```text
index.html                         -> 1.6.1
android_build/www/index.html       -> 1.6.1
android_build/www/sw.js            -> youtube-music-player-v1.0.1
android_build/build.bat            -> versionCode 2 / versionName 1.0.1
```

## Release Checklist

1. Change the web version in both `index.html` files.
2. Change `CACHE_NAME` in `android_build/www/sw.js`.
3. Change `ANDROID_VERSION_NAME` in `android_build/build.bat`.
4. Increase `ANDROID_VERSION_CODE` for a newer Android release.
5. Run `android_build/build.bat` to generate the APK.
6. Confirm the version shown in the app and Android application information.
