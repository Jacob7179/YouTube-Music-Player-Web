const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const androidRoot = path.join(projectRoot, "android");
const capacitorConfig = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "capacitor.config.json"), "utf8")
);
const appId = capacitorConfig.appId;
if (!appId || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(appId)) {
  throw new Error(`Invalid Capacitor appId: ${appId}`);
}
const packagePath = path.join(
  androidRoot,
  "app",
  "src",
  "main",
  "java",
  ...appId.split(".")
);
const resPath = path.join(androidRoot, "app", "src", "main", "res");
const manifestPath = path.join(androidRoot, "app", "src", "main", "AndroidManifest.xml");
const configXmlPath = path.join(resPath, "xml", "config.xml");

if (!fs.existsSync(androidRoot)) {
  console.warn("Android project was not found; run this script after `npx cap sync android`.");
  process.exit(0);
}

fs.mkdirSync(packagePath, { recursive: true });
fs.mkdirSync(path.join(resPath, "layout"), { recursive: true });

const backgroundWebView = `package ${appId};

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * Keeps Chromium media playback alive when Android hides the activity.
 * Standard WebView reports GONE when the user locks the screen or opens
 * another app; embedded players such as YouTube interpret that as a signal
 * to stop playback.
 */
public class BackgroundCapacitorWebView extends CapacitorWebView {

    public BackgroundCapacitorWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (visibility == View.GONE) {
            // Do not forward GONE to Chromium while a foreground media
            // session is responsible for playback.
            return;
        }
        super.onWindowVisibilityChanged(View.VISIBLE);
    }
}
`;

const mainActivity = `package ${appId};

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 7179;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureBackgroundMediaPlayback();
        requestMediaNotificationPermission();
    }

    private void configureBackgroundMediaPlayback() {
        if (getBridge() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setKeepScreenOn(false);
        webView.resumeTimers();
        webView.onResume();
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebPlaybackRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebPlaybackRunning();
    }

    private void keepWebPlaybackRunning() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        getBridge().getWebView().resumeTimers();
        getBridge().getWebView().onResume();
    }

    private void requestMediaNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                NOTIFICATION_PERMISSION_REQUEST
            );
        }
    }
}
`;

const layout = `<?xml version="1.0" encoding="utf-8"?>
<androidx.coordinatorlayout.widget.CoordinatorLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <${appId}.BackgroundCapacitorWebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</androidx.coordinatorlayout.widget.CoordinatorLayout>
`;

fs.writeFileSync(path.join(packagePath, "BackgroundCapacitorWebView.java"), backgroundWebView, "utf8");
fs.writeFileSync(path.join(packagePath, "MainActivity.java"), mainActivity, "utf8");
fs.writeFileSync(path.join(resPath, "layout", "capacitor_bridge_layout_main.xml"), layout, "utf8");

if (!fs.existsSync(manifestPath)) {
  throw new Error(`AndroidManifest.xml was not found: ${manifestPath}`);
}

let manifest = fs.readFileSync(manifestPath, "utf8");
const permissions = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS"
];

for (const permission of permissions) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace(
      "<application",
      `    <uses-permission android:name="${permission}" />\n\n    <application`
    );
  }
}
fs.writeFileSync(manifestPath, manifest, "utf8");

if (fs.existsSync(configXmlPath)) {
  let configXml = fs.readFileSync(configXmlPath, "utf8");
  if (!configXml.includes('name="KeepRunning"')) {
    configXml = configXml.replace(
      "</widget>",
      '    <preference name="KeepRunning" value="true" />\n</widget>'
    );
    fs.writeFileSync(configXmlPath, configXml, "utf8");
  }
}

console.log("Configured Android WebView and foreground media playback support.");
