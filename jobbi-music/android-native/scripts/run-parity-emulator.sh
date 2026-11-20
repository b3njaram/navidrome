#!/usr/bin/env bash
# Real Android emulator UI parity test. Never signs into a live NAS.
set -euo pipefail
ROOT="$GITHUB_WORKSPACE"
cd "$ROOT"
gradle --no-daemon -p jobbi-music/android-native :app:assembleDebug :app:assembleDebugAndroidTest

adb install -r jobbi-music/android-native/app/build/outputs/apk/debug/app-debug.apk
adb install -r jobbi-music/android-native/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

# Keep the debuggable target APK installed until screenshots are exported.
# Gradle connectedAndroidTest automatically uninstalls test artifacts.
adb shell am instrument -w -r \
  com.jobbisoft.music.nativeplayer.debug.test/androidx.test.runner.AndroidJUnitRunner \
  | tee "$ROOT/jobbi-emulator-instrumentation.log"
grep -Eq 'OK \\(([6-9]|[1-9][0-9]+) tests\\)' "$ROOT/jobbi-emulator-instrumentation.log"

mkdir -p "$ROOT/jobbi-parity-android"
for screen in home library search more nowplaying; do
  output="$ROOT/jobbi-parity-android/parity-android-$screen.png"
  adb exec-out run-as com.jobbisoft.music.nativeplayer.debug \
    cat "files/jobbi-parity/parity-android-$screen.png" > "$output"
  test -s "$output"
  echo "Captured Android $screen: $(wc -c < "$output") bytes"
done
