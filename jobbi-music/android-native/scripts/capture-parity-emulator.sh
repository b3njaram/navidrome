#!/usr/bin/env bash
# Actual Android emulator screen capture run. The emulator runner invokes each
# YAML script line separately, so commands with loops/pipes must live in this
# single shell script. All fixture data is offline and synthetic.
set -euo pipefail
ROOT="${GITHUB_WORKSPACE:?GitHub workspace not configured}"
NATIVE="$ROOT/jobbi-music/android-native"
APK="$NATIVE/app/build/outputs/apk/debug/app-debug.apk"
TEST_APK="$NATIVE/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
TEST_LOG="$ROOT/jobbi-emulator-instrumentation.log"
mkdir -p "$ROOT/jobbi-parity-android"
gradle --no-daemon -p "$NATIVE" :app:assembleDebug :app:assembleDebugAndroidTest
test -s "$APK"
test -s "$TEST_APK"
adb install -r "$APK"
adb install -r "$TEST_APK"
# Run instrumentation directly rather than connectedAndroidTest: that Gradle
# task automatically uninstalls the app and destroys its screenshot files.
adb shell am instrument -w -r \
  com.jobbisoft.music.nativeplayer.debug.test/androidx.test.runner.AndroidJUnitRunner \
  | tee "$TEST_LOG"
grep -Fq 'OK (5 tests)' "$TEST_LOG"
for screen in home library search more nowplaying; do
  file="$ROOT/jobbi-parity-android/parity-android-$screen.png"
  adb exec-out run-as com.jobbisoft.music.nativeplayer.debug \
    cat "files/jobbi-parity/parity-android-$screen.png" > "$file"
  test -s "$file"
  printf 'Captured %s (%s bytes)\n' "$screen" "$(wc -c < "$file")"
done
echo "All 5 Android screenshots captured."
