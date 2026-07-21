const fs = require('fs');
const path = require('path');

const TITLE_BACKGROUND = '#6cc2ff';
const SPLASH_VISIBLE_MS = 1400;
const FADE_DURATION_MS = 250;

const androidBuildDir = path.resolve(__dirname, '..');
const appMainDir = path.join(androidBuildDir, 'android', 'app', 'src', 'main');
const resDir = path.join(appMainDir, 'res');
const stylesPath = path.join(resDir, 'values', 'styles.xml');
const colorsPath = path.join(resDir, 'values', 'startup_splash_colors.xml');
const layoutPath = path.join(resDir, 'layout', 'activity_startup_splash.xml');
const javaRoot = path.join(appMainDir, 'java');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/^\uFEFF/, ''), 'utf8');
}

function findFile(root, fileName) {
  if (!fs.existsSync(root)) return null;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(fullPath, fileName);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === fileName) {
      return fullPath;
    }
  }
  return null;
}

function replaceStyle(xml, styleName, transformBody) {
  const escapedName = styleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(<style\\s+name=["']${escapedName}["'][^>]*>)([\\s\\S]*?)(<\\/style>)`
  );
  const match = xml.match(pattern);
  if (!match) fail(`${styleName} was not found in styles.xml.`);

  const replacement = `${match[1]}\n${transformBody(match[2])}\n    ${match[3]}`;
  return xml.replace(pattern, replacement);
}

function configureStyles() {
  if (!fs.existsSync(stylesPath)) {
    fail(`Android styles.xml was not found: ${stylesPath}`);
  }

  let styles = fs.readFileSync(stylesPath, 'utf8').replace(/^\uFEFF/, '');

  styles = replaceStyle(styles, 'AppTheme.NoActionBar', (body) => {
    const retained = body
      .replace(/\s*<item\s+name=["']android:(?:background|windowBackground)["'][^>]*>[\s\S]*?<\/item>\s*/g, '\n')
      .trim();
    const prefix = retained ? `        ${retained.replace(/\n/g, '\n        ')}\n` : '';
    return `${prefix}        <item name="android:windowBackground">@color/startup_splash_background</item>\n        <item name="android:background">@color/startup_splash_background</item>`;
  });

  styles = replaceStyle(styles, 'AppTheme.NoActionBarLaunch', () => (
    '        <item name="android:background">@color/startup_splash_background</item>\n' +
    '        <item name="android:windowBackground">@color/startup_splash_background</item>\n' +
    '        <item name="windowSplashScreenBackground">@color/startup_splash_background</item>\n' +
    '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>'
  ));

  writeUtf8(stylesPath, styles);
}

function createResources() {
  const colors = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="startup_splash_background">${TITLE_BACKGROUND}</color>
</resources>
`;

  const layout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@color/startup_splash_background">

    <!-- Solid title area. The splash bitmap is deliberately not used here. -->
    <TextView
        android:id="@+id/startupSplashTitle"
        android:layout_width="match_parent"
        android:layout_height="64dp"
        android:background="@color/startup_splash_background"
        android:gravity="center_vertical"
        android:paddingStart="16dp"
        android:paddingEnd="16dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="@string/title_activity_main"
        android:textColor="#FFFFFF"
        android:textSize="26sp"
        android:textStyle="bold" />

    <!-- centerCrop fills the remaining area without changing the image aspect ratio. -->
    <ImageView
        android:id="@+id/startupSplashImage"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:background="@color/startup_splash_background"
        android:contentDescription="@string/title_activity_main"
        android:scaleType="centerCrop"
        android:src="@drawable/splash" />

</LinearLayout>
`;

  writeUtf8(colorsPath, colors);
  writeUtf8(layoutPath, layout);
}

function ensureImports(source, imports) {
  const packageMatch = source.match(/^package\s+[^;]+;/m);
  if (!packageMatch) fail('The package declaration was not found in MainActivity.java.');

  const missing = imports.filter((importLine) => !source.includes(importLine));
  if (missing.length === 0) return source;

  const insertAt = packageMatch.index + packageMatch[0].length;
  return `${source.slice(0, insertAt)}\n\n${missing.join('\n')}\n${source.slice(insertAt).replace(/^\s*/, '')}`;
}

function configureMainActivity() {
  const mainActivityPath = findFile(javaRoot, 'MainActivity.java');
  if (!mainActivityPath) {
    fail(`MainActivity.java was not found below: ${javaRoot}`);
  }

  let source = fs.readFileSync(mainActivityPath, 'utf8').replace(/^\uFEFF/, '');
  source = ensureImports(source, [
    'import android.os.Bundle;',
    'import android.os.Handler;',
    'import android.os.Looper;',
    'import android.view.View;',
    'import android.view.ViewGroup;'
  ]);

  const beginMarker = '    // YTMP_STARTUP_SPLASH_BEGIN';
  const endMarker = '    // YTMP_STARTUP_SPLASH_END';
  const markedBlockPattern = new RegExp(
    `\\n\\s*// YTMP_STARTUP_SPLASH_BEGIN[\\s\\S]*?// YTMP_STARTUP_SPLASH_END\\s*`,
    'm'
  );

  // Remove only the block created by this script before rebuilding it. This
  // keeps repeated builds idempotent without touching unrelated activity code.
  source = source.replace(markedBlockPattern, '\n');

  const hasOnCreate = /protected\s+void\s+onCreate\s*\(\s*Bundle\s+\w+\s*\)/.test(source);
  let helperBlock;

  if (hasOnCreate) {
    if (!source.includes('showStartupSplash();')) {
      const superPattern = /(super\.onCreate\s*\([^;]+;)/;
      if (!superPattern.test(source)) {
        fail('An existing onCreate method was found, but super.onCreate(...) could not be located.');
      }
      source = source.replace(superPattern, '$1\n        showStartupSplash();');
    }

    helperBlock = `
${beginMarker}
    private void showStartupSplash() {
        final ViewGroup root = findViewById(android.R.id.content);
        if (root == null) return;

        final View overlay = getLayoutInflater().inflate(
                R.layout.activity_startup_splash,
                root,
                false
        );
        root.addView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        overlay.bringToFront();

        new Handler(Looper.getMainLooper()).postDelayed(() ->
                overlay.animate()
                        .alpha(0f)
                        .setDuration(${FADE_DURATION_MS}L)
                        .withEndAction(() -> root.removeView(overlay))
                        .start(),
                ${SPLASH_VISIBLE_MS}L
        );
    }
${endMarker}
`;
  } else {
    helperBlock = `
${beginMarker}
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showStartupSplash();
    }

    private void showStartupSplash() {
        final ViewGroup root = findViewById(android.R.id.content);
        if (root == null) return;

        final View overlay = getLayoutInflater().inflate(
                R.layout.activity_startup_splash,
                root,
                false
        );
        root.addView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        overlay.bringToFront();

        new Handler(Looper.getMainLooper()).postDelayed(() ->
                overlay.animate()
                        .alpha(0f)
                        .setDuration(${FADE_DURATION_MS}L)
                        .withEndAction(() -> root.removeView(overlay))
                        .start(),
                ${SPLASH_VISIBLE_MS}L
        );
    }
${endMarker}
`;
  }

  const finalBrace = source.lastIndexOf('}');
  if (finalBrace < 0) fail('The closing brace was not found in MainActivity.java.');
  source = `${source.slice(0, finalBrace).trimEnd()}\n${helperBlock}\n}`;

  writeUtf8(mainActivityPath, source);
  return mainActivityPath;
}

configureStyles();
createResources();
const mainActivityPath = configureMainActivity();

console.log(`Splash title background: ${TITLE_BACKGROUND}`);
console.log('Splash image scale type: centerCrop (aspect ratio preserved).');
console.log(`Splash overlay duration: ${SPLASH_VISIBLE_MS} ms + ${FADE_DURATION_MS} ms fade.`);
console.log(`Updated MainActivity: ${mainActivityPath}`);
console.log(`Created layout: ${layoutPath}`);
