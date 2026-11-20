#!/usr/bin/env bash
# Real Android emulator UI parity test. Never signs into a live NAS.
set -euo pipefail
ROOT="$GITHUB_WORKSPACE"
cd "$ROOT"
gradle --no-daemon -p jobbi-music/android-native :app:assembleDebug :app:assembleDebugAndroidTest

adb install -r jobbi-music/android-native/app/build/outputs/apk/debug/app-debug.apk
adb install -r jobbi-music/android-native/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

# Deterministic screenshot parity must not pretend to measure real animation.
# An optional separate profiling invocation can explicitly set
# JOBBI_ANIMATION_PROFILE=1; its performance is emulator-only.
if [[ "${JOBBI_ANIMATION_PROFILE:-0}" == "1" ]]; then
  animation_scale=1.0
else
  animation_scale=0.0
fi
adb shell settings put global window_animation_scale "$animation_scale"
adb shell settings put global transition_animation_scale "$animation_scale"
adb shell settings put global animator_duration_scale "$animation_scale"
echo "Emulator animation scale: $animation_scale"
adb shell dumpsys gfxinfo com.jobbisoft.music.nativeplayer.debug reset >/dev/null 2>&1 || true

# Keep the debuggable target APK installed until screenshots are exported.
# Gradle connectedAndroidTest automatically uninstalls test artifacts.
adb shell am instrument -w -r \
  com.jobbisoft.music.nativeplayer.debug.test/androidx.test.runner.AndroidJUnitRunner \
  | tee "$ROOT/jobbi-emulator-instrumentation.log"
grep -Eq 'OK \(([6-9]|[1-9][0-9]+) tests\)' "$ROOT/jobbi-emulator-instrumentation.log"

mkdir -p "$ROOT/jobbi-parity-android"
# The activity is destroyed when instrumentation exits. Prefer the frame
# counters saved from INSIDE the running screenshot test.
if ! adb exec-out run-as com.jobbisoft.music.nativeplayer.debug \
    cat files/jobbi-parity/android-gfxinfo.txt \
    > "$ROOT/jobbi-parity-android/android-gfxinfo.txt"; then
  adb shell dumpsys gfxinfo com.jobbisoft.music.nativeplayer.debug framestats \
    > "$ROOT/jobbi-parity-android/android-gfxinfo.txt" || true
fi
JOBBI_ANIMATIONS_ENABLED="${JOBBI_ANIMATION_PROFILE:-0}" python3 jobbi-music/android-native/scripts/summarize-motion.py \
  "$ROOT/jobbi-parity-android/android-gfxinfo.txt" \
  "$ROOT/jobbi-parity-android/android-motion-profile.json"
for screen in home library search more nowplaying; do
  output="$ROOT/jobbi-parity-android/parity-android-$screen.png"
  adb exec-out run-as com.jobbisoft.music.nativeplayer.debug \
    cat "files/jobbi-parity/parity-android-$screen.png" > "$output"
  test -s "$output"
  echo "Captured Android $screen: $(wc -c < "$output") bytes"
done
