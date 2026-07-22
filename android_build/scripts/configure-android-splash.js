const fs = require('fs');
const path = require('path');

const SPLASH_BACKGROUND = '#005495';

const androidBuildDir = path.resolve(__dirname, '..');
const appMainDir = path.join(androidBuildDir, 'android', 'app', 'src', 'main');
const resDir = path.join(appMainDir, 'res');
const stylesPath = path.join(resDir, 'values', 'styles.xml');
const colorsPath = path.join(resDir, 'values', 'startup_splash_colors.xml');
const oldLayoutPath = path.join(resDir, 'layout', 'activity_startup_splash.xml');
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

function removeItems(body, itemNames) {
  const namePattern = itemNames
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return body
    .replace(
      new RegExp(
        `\\s*<item\\s+name=["'](?:${namePattern})["'][^>]*>[\\s\\S]*?<\\/item>\\s*`,
        'g'
      ),
      '\n'
    )
    .trim();
}

function indentBody(body) {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';
  return `${lines.map((line) => `        ${line}`).join('\n')}\n`;
}

function configureStyles() {
  if (!fs.existsSync(stylesPath)) {
    fail(`Android styles.xml was not found: ${stylesPath}`);
  }

  let styles = fs.readFileSync(stylesPath, 'utf8').replace(/^\uFEFF/, '');

  styles = replaceStyle(styles, 'AppTheme.NoActionBar', (body) => {
    const retained = removeItems(body, [
      'android:background',
      'android:windowBackground'
    ]);

    return (
      `${indentBody(retained)}` +
      '        <item name="android:windowBackground">@color/startup_splash_background</item>\n' +
      '        <item name="android:background">@color/startup_splash_background</item>'
    );
  });

  styles = replaceStyle(styles, 'AppTheme.NoActionBarLaunch', (body) => {
    const retained = removeItems(body, [
      'android:background',
      'android:windowBackground',
      'windowSplashScreenBackground',
      'postSplashScreenTheme'
    ]);

    return (
      `${indentBody(retained)}` +
      '        <item name="android:background">@drawable/splash</item>\n' +
      '        <item name="windowSplashScreenBackground">@color/startup_splash_background</item>\n' +
      '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>'
    );
  });

  writeUtf8(stylesPath, styles);
}

function createColorResource() {
  const colors = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="startup_splash_background">${SPLASH_BACKGROUND}</color>
</resources>
`;

  writeUtf8(colorsPath, colors);
}

function removeOldOverlayResources() {
  if (fs.existsSync(oldLayoutPath)) {
    fs.unlinkSync(oldLayoutPath);
  }
}

function removeOldOverlayCode() {
  const mainActivityPath = findFile(javaRoot, 'MainActivity.java');
  if (!mainActivityPath) return null;

  let source = fs.readFileSync(mainActivityPath, 'utf8').replace(/^\uFEFF/, '');
  const original = source;

  source = source.replace(
    /\n\s*\/\/ YTMP_STARTUP_SPLASH_BEGIN[\s\S]*?\/\/ YTMP_STARTUP_SPLASH_END\s*/m,
    '\n'
  );
  source = source.replace(/^\s*showStartupSplash\(\);\s*\r?\n/gm, '');

  if (source !== original) {
    writeUtf8(mainActivityPath, source);
  }

  return mainActivityPath;
}

configureStyles();
createColorResource();
removeOldOverlayResources();
const mainActivityPath = removeOldOverlayCode();

console.log(`Native splash background: ${SPLASH_BACKGROUND}`);
console.log('Removed the custom delayed startup overlay (second splash screen).');
if (mainActivityPath) {
  console.log(`Checked MainActivity: ${mainActivityPath}`);
}
