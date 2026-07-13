const fs = require("fs");
const path = require("path");

const pluginJavaDir = path.join(
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
  "mediasession"
);

const serviceJavaFile = path.join(pluginJavaDir, "MediaSessionService.java");
const callbackJavaFile = path.join(pluginJavaDir, "MediaSessionCallback.java");

if (!fs.existsSync(serviceJavaFile) || !fs.existsSync(callbackJavaFile)) {
  console.warn("Media Session Android source was not found; skipping patch.");
  process.exit(0);
}

let source = fs.readFileSync(serviceJavaFile, "utf8");
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

// Pass the service playback state to the callback so one wired-headset click
// can reliably choose Play or Pause while two/three clicks select tracks.
replaceOnce(
  "mediaSession.setCallback(new MediaSessionCallback(plugin));",
  "mediaSession.setCallback(new MediaSessionCallback(plugin, this));",
  "media-button callback initialization"
);
replaceOnce(
  `    public void setPlaybackState(int newPlaybackState) {`,
  `    boolean isPlaybackPlaying() {\n        return playbackState == PlaybackStateCompat.STATE_PLAYING;\n    }\n\n    public void setPlaybackState(int newPlaybackState) {`,
  "media-button playback-state helper"
);

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
  `        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);\n        if (powerManager != null) {\n            playbackWakeLock = powerManager.newWakeLock(\n                PowerManager.PARTIAL_WAKE_LOCK,\n                getPackageName() + ":MediaPlayback"\n            );\n            playbackWakeLock.setReferenceCounted(false);\n        }\n\n        notificationStyle = new MediaStyle().setMediaSession(mediaSession.getSessionToken());`,
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


// Make Android's system media panel and notification expose a real timeline.
// The explicit update timestamp lets Android extrapolate the current position
// while playing, and notification progress is refreshed after each JS update.
replaceOnce(
  "import android.os.PowerManager;",
  "import android.os.PowerManager;\nimport android.os.SystemClock;",
  "SystemClock import"
);
replaceOnce(
  ".setState(PlaybackStateCompat.STATE_PAUSED, position, playbackSpeed);",
  ".setState(PlaybackStateCompat.STATE_PAUSED, position, playbackSpeed, SystemClock.elapsedRealtime());",
  "initial playback position timestamp"
);
replaceOnce(
  `    public void setPosition(long newPosition) {\n        if (position != newPosition) {\n            position = newPosition;\n            playbackStateUpdate = true;\n        }\n    }`,
  `    public void setPosition(long newPosition) {\n        if (position != newPosition) {\n            position = newPosition;\n            playbackStateUpdate = true;\n            notificationUpdate = true;\n        }\n    }`,
  "notification position refresh"
);
replaceOnce(
  `    @SuppressLint("RestrictedApi")\n    public void update() {`,
  `    private String formatPlaybackTime(long milliseconds) {\n        long totalSeconds = Math.max(0L, milliseconds / 1000L);\n        long hours = totalSeconds / 3600L;\n        long minutes = (totalSeconds % 3600L) / 60L;\n        long seconds = totalSeconds % 60L;\n\n        if (hours > 0L) {\n            return String.format(java.util.Locale.US, "%d:%02d:%02d", hours, minutes, seconds);\n        }\n        return String.format(java.util.Locale.US, "%d:%02d", minutes, seconds);\n    }\n\n    @SuppressLint("RestrictedApi")\n    public void update() {`,
  "playback time formatter"
);
replaceOnce(
  "playbackStateBuilder.setState(playbackState, position, playbackSpeed);",
  "playbackStateBuilder.setState(playbackState, position, playbackSpeed, SystemClock.elapsedRealtime());",
  "playback position timestamp"
);
replaceOnce(
  `            notificationBuilder.setContentTitle(title).setContentText(artist + " - " + album).setLargeIcon(artwork);`,
  `            if (duration > 0L) {\n                int durationSeconds = (int) Math.min(duration / 1000L, Integer.MAX_VALUE);\n                int positionSeconds = (int) Math.min(\n                    Math.max(position / 1000L, 0L),\n                    durationSeconds\n                );\n                long remaining = Math.max(0L, duration - position);\n                notificationBuilder.setProgress(durationSeconds, positionSeconds, false);\n                notificationBuilder.setContentText(\n                    artist + " • "\n                        + formatPlaybackTime(position) + " / -" + formatPlaybackTime(remaining)\n                        + " • " + album\n                );\n            } else {\n                notificationBuilder.setProgress(0, 0, false);\n                notificationBuilder.setContentText(artist + " • " + album);\n            }\n            notificationBuilder.setContentTitle(title).setSubText(null).setLargeIcon(artwork);`,
  "visible notification playback progress"
);

if (changed) {
  fs.writeFileSync(serviceJavaFile, source, "utf8");
}

// MediaSessionCompat only has built-in single/double-tap behavior for a
// headset hook. This callback adds explicit triple-click support:
//   1 click  = Play/Pause
//   2 clicks = Next track
//   3 clicks = Previous track
const callbackSource = `package com.capgo.mediasession;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.support.v4.media.session.MediaSessionCompat;
import android.view.KeyEvent;
import com.getcapacitor.JSObject;

public class MediaSessionCallback extends MediaSessionCompat.Callback {

    // A slightly wider interval than Android's double-tap timeout makes
    // three presses from physical wired-earphone buttons easier to detect.
    private static final long WIRED_HEADSET_MULTI_CLICK_TIMEOUT_MS = 450L;

    private final MediaSessionPlugin plugin;
    private final MediaSessionService service;
    private final Handler mediaButtonHandler = new Handler(Looper.getMainLooper());
    private int wiredHeadsetClickCount = 0;

    private final Runnable resolveWiredHeadsetClicks = new Runnable() {
        @Override
        public void run() {
            int clickCount = wiredHeadsetClickCount;
            wiredHeadsetClickCount = 0;

            if (clickCount == 1) {
                plugin.actionCallback(service.isPlaybackPlaying() ? "pause" : "play");
            } else if (clickCount == 2) {
                plugin.actionCallback("nexttrack");
            }
        }
    };

    MediaSessionCallback(MediaSessionPlugin plugin, MediaSessionService service) {
        this.plugin = plugin;
        this.service = service;
    }

    @Override
    public boolean onMediaButtonEvent(Intent mediaButtonIntent) {
        if (mediaButtonIntent == null || !Intent.ACTION_MEDIA_BUTTON.equals(mediaButtonIntent.getAction())) {
            return super.onMediaButtonEvent(mediaButtonIntent);
        }

        KeyEvent keyEvent = mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        if (keyEvent == null) {
            return super.onMediaButtonEvent(mediaButtonIntent);
        }

        int keyCode = keyEvent.getKeyCode();
        boolean isWiredHeadsetButton =
            keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
            keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;

        if (!isWiredHeadsetButton) {
            return super.onMediaButtonEvent(mediaButtonIntent);
        }

        // Consume ACTION_UP so it is not counted as another click.
        if (keyEvent.getAction() == KeyEvent.ACTION_UP) {
            return true;
        }

        // Ignore auto-repeat events caused by holding the button down.
        if (keyEvent.getAction() != KeyEvent.ACTION_DOWN || keyEvent.getRepeatCount() > 0) {
            return true;
        }

        mediaButtonHandler.removeCallbacks(resolveWiredHeadsetClicks);
        wiredHeadsetClickCount++;

        if (wiredHeadsetClickCount >= 3) {
            wiredHeadsetClickCount = 0;
            plugin.actionCallback("previoustrack");
        } else {
            mediaButtonHandler.postDelayed(
                resolveWiredHeadsetClicks,
                WIRED_HEADSET_MULTI_CLICK_TIMEOUT_MS
            );
        }

        return true;
    }

    @Override
    public void onPlay() {
        plugin.actionCallback("play");
    }

    @Override
    public void onPause() {
        plugin.actionCallback("pause");
    }

    @Override
    public void onSeekTo(long pos) {
        JSObject data = new JSObject();
        data.put("seekTime", (double) pos / 1000.0);
        plugin.actionCallback("seekto", data);
    }

    @Override
    public void onRewind() {
        plugin.actionCallback("seekbackward");
    }

    @Override
    public void onFastForward() {
        plugin.actionCallback("seekforward");
    }

    @Override
    public void onSkipToPrevious() {
        plugin.actionCallback("previoustrack");
    }

    @Override
    public void onSkipToNext() {
        plugin.actionCallback("nexttrack");
    }

    @Override
    public void onStop() {
        plugin.actionCallback("stop");
    }
}
`;

const existingCallbackSource = fs.readFileSync(callbackJavaFile, "utf8");
let callbackChanged = false;
if (!existingCallbackSource.includes("WIRED_HEADSET_MULTI_CLICK_TIMEOUT_MS")) {
  if (!existingCallbackSource.includes("public class MediaSessionCallback extends MediaSessionCompat.Callback")) {
    throw new Error("Unable to patch MediaSessionCallback.java; unsupported plugin source.");
  }
  fs.writeFileSync(callbackJavaFile, callbackSource, "utf8");
  callbackChanged = true;
}

if (changed || callbackChanged) {
  console.log(
    "Patched Android Media Session for background playback and wired-headset 1/2/3-click controls."
  );
} else {
  console.log("Android Media Session patches are already applied.");
}
