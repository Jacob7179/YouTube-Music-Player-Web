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
let changed = false;

function replaceOnce(from, to, label) {
  if (source.includes(to)) {
    return;
  }
  if (!source.includes(from)) {
    throw new Error(`Unable to apply ${label}; expected source text was not found.`);
  }
  source = source.replace(from, to);
  changed = true;
}

// Fix incorrect Play/Pause masks in version 7.3.0. The plugin callback
// implements onPlay() and onPause(), not onPlayPause(), so every combined
// action must be reduced to its specific action.
for (const [from, to] of [
  [
    "PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PLAY",
    "PlaybackStateCompat.ACTION_PLAY"
  ],
  [
    "PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PAUSE",
    "PlaybackStateCompat.ACTION_PAUSE"
  ]
]) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    changed = true;
  }
}

// Keep the CPU available while a track is actively playing. The lock is
// released immediately when playback pauses, ends, stops, or the service dies.
replaceOnce(
  "import android.os.IBinder;",
  "import android.os.IBinder;\nimport android.os.PowerManager;",
  "PowerManager import"
);
replaceOnce(
  "    private float playbackSpeed = 1.0F;",
  "    private float playbackSpeed = 1.0F;\n    private PowerManager.WakeLock playbackWakeLock;",
  "wake-lock field"
);
replaceOnce(
  "        notificationStyle = new MediaStyle().setMediaSession(mediaSession.getSessionToken());",
  `        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);\n        if (powerManager != null) {\n            playbackWakeLock = powerManager.newWakeLock(\n                PowerManager.PARTIAL_WAKE_LOCK,\n                getPackageName() + \":MediaPlayback\"\n            );\n            playbackWakeLock.setReferenceCounted(false);\n        }\n\n        notificationStyle = new MediaStyle().setMediaSession(mediaSession.getSessionToken());`,
  "wake-lock initialization"
);
replaceOnce(
  `    public void destroy() {\n        stopForeground(true);\n        stopSelf();\n    }`,
  `    private void updatePlaybackWakeLock() {\n        if (playbackWakeLock == null) {\n            return;\n        }\n\n        if (playbackState == PlaybackStateCompat.STATE_PLAYING) {\n            if (!playbackWakeLock.isHeld()) {\n                playbackWakeLock.acquire();\n            }\n        } else if (playbackWakeLock.isHeld()) {\n            playbackWakeLock.release();\n        }\n    }\n\n    private void releasePlaybackWakeLock() {\n        if (playbackWakeLock != null && playbackWakeLock.isHeld()) {\n            playbackWakeLock.release();\n        }\n    }\n\n    public void destroy() {\n        releasePlaybackWakeLock();\n        stopForeground(true);\n        stopSelf();\n    }\n\n    @Override\n    public void onDestroy() {\n        releasePlaybackWakeLock();\n        if (mediaSession != null) {\n            mediaSession.release();\n        }\n        super.onDestroy();\n    }`,
  "wake-lock cleanup"
);
replaceOnce(
  `    public void setPlaybackState(int newPlaybackState) {\n        if (playbackState != newPlaybackState) {\n            playbackState = newPlaybackState;\n            playbackStateUpdate = true;\n            possibleActionsUpdate = true;\n        }\n    }`,
  `    public void setPlaybackState(int newPlaybackState) {\n        if (playbackState != newPlaybackState) {\n            playbackState = newPlaybackState;\n            playbackStateUpdate = true;\n            possibleActionsUpdate = true;\n        }\n        updatePlaybackWakeLock();\n    }`,
  "wake-lock state update"
);

if (changed) {
  fs.writeFileSync(javaFile, source, "utf8");
  console.log("Patched Android Media Session for reliable background playback.");
} else {
  console.log("Android Media Session background-playback patch is already applied.");
}
