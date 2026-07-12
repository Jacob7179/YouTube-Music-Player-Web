const fs = require("fs");
const path = require("path");

const javaFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "@capgo",
  "capacitor-media-session",
  "android",
  "src",
  "main",
  "java",
  "com",
  "capgo",
  "mediasession",
  "MediaSessionService.java"
);

if (!fs.existsSync(javaFile)) {
  console.warn("Media Session Android source was not found; skipping patch.");
  process.exit(0);
}

let source = fs.readFileSync(javaFile, "utf8");
const replacements = [
  [
    "PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PLAY",
    "PlaybackStateCompat.ACTION_PLAY"
  ],
  [
    "PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PAUSE",
    "PlaybackStateCompat.ACTION_PAUSE"
  ]
];

let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from, to);
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(javaFile, source, "utf8");
  console.log("Patched Android Media Session Play/Pause notification actions.");
} else {
  console.log("Android Media Session Play/Pause patch is already applied.");
}
