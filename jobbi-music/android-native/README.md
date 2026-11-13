### Android Auto + Samsung lock-screen artwork (v1.0.11)

**Android Auto:** Jobbi Music now advertises the standard Android Auto media-app descriptor and uses a Media3 **MediaLibraryService** rather than an unbrowsable playback-only service. The built-in car UI can browse Recently Added, Favorite Songs, Playlists, Albums and Downloads. Sign in to Jobbi Music on the phone before opening it in Android Auto. Browsing and car playback share the existing Media3 queue; they do not grant NAS administration or file-import actions to the car.

Because this is an APK installed outside Google Play, Android Auto may hide it until you enable **Android Auto developer settings → Unknown sources** on the phone. You may also need to enable Jobbi Music in Android Auto's app launcher settings. This option may be restricted by your vehicle or phone, and installing from Google Play through a testing track is the more reliable alternative.

**Samsung One UI:** Media3 continues to publish the standard foreground media notification, session, controls and transport state. On each song transition, Jobbi Music now retrieves the private NAS cover art using its authenticated session and includes a small image directly in Media3 playback metadata. This gives Samsung's lock-screen card, expanded media notification and Now Bar access to the artwork even though the art URL requires a private cookie. For devices that support the feature, turn on **Settings → Lock screen and AOD → Now Bar → Media player**. Samsung controls whether the top status-bar media pill or Now Bar appears; the app cannot force a system overlay on unsupported or disabled devices.

Only the native Android Kotlin APK changes. Website and native iPhone remain unchanged. Android Auto, Bluetooth transport controls and notifications should be verified on a real Samsung phone and a compatible vehicle; CI covers compilation and emulator tests, not a full vehicle session.

### Native recommendations and playback counting (v1.0.6)

Home shows per-user weekly and monthly charts, recently added songs, Made for You and time-of-day mixes. Optional weather mixes require a city that the listener enters; no GPS is accessed. The Android Media3 **service** reports qualified scrobbles for listening continuing in the background, preventing the previous Android gap in weekly/monthly charts. Skipped/seeked tracks do not inflate playback counts. Listening history begins with this version of the server backend; older Navidrome lifetime totals are not assigned arbitrary dates.

### Native offline collection downloads (v1.0.5)

The app has playlist, all-playlists and Favorites download buttons. Background downloads are handled by Android DownloadManager in per-account, app-private Music directories. Wi-Fi-only is enabled by default. Completed files play through Media3 without contacting Navidrome. More → Offline downloads opens the local library. If auto-login fails for network reasons, a securely remembered account can unlock its previously downloaded tracks; changing or revoking credentials still requires a new login. Web supports an original-audio ZIP archive instead of the APK's local offline queue.

# Jobbi Music — fully native Android (Material 3)

**This is a new Kotlin/Jetpack Compose application, not a WebView.** It builds its own UI, uses OkHttp to access the existing Jobbi Music JSON API, and uses a real Media3 ExoPlayer/MediaLibraryService for background audio. The previous hybrid Android project in `../android/` is untouched.

## Install the development APK

Open the latest successful **Build native Material 3 Jobbi Music APK** workflow on GitHub Actions, download the `Jobbi-Music-Native-Material3-APK` artifact, unzip it, and install `app-debug.apk` on Android 8.0+.

The debug application ID is `com.jobbisoft.music.nativeplayer.debug`, so this edition installs alongside the existing hybrid app. Debug builds are for private testing; a production store release needs a controlled release keystore and testing on real Pixel devices. The workflow preserves its debug signing key for compatible APK updates.

## Features

- Material You dynamic color on Android 12+, responsive native Compose layouts with minimal screen transitions.
- Native sign-in to your existing account over HTTPS (`https://music.jobbisoft.com.mx` by default).
- Home, albums, search, library, favorites, playlists, playlist-local search, playlist visibility, bulk favorites, collaborator invitations, and personal album/playlist artwork.
- Full native queue, seek bar, quality options (original / 320 kbps / 128 kbps), play/pause/previous/next controls.
- Android Media3 foreground playback, notification/lock-screen/headphone controls, and audio-focus handling.
- CSV/TSV playlist metadata import from Spotify and Apple Music with checked artist/title matching, FLAC preference, and explicit approval before each Soulseek queue operation.
- **Invidious fallback** in native server discovery: searches alternate Invidious instances alongside Soulseek, displays authenticated video thumbnails and external watch links; can explicitly queue authorized audio imports if the optional NAS Invidious worker is enabled, with separate import-job progress.

## Network/security model

- Account credentials are sent only to the HTTPS Jobbi Music server. The app never saves your password.
- An in-process, host-restricted HttpOnly session-cookie jar is reused by media streaming, album images, and JSON API calls.
- The player can continue in the background while the app process stays active. Restarting the process currently requires signing in again; future versions can add an Android Keystore-backed session persistence mechanism.
- Streaming, album covers, playlists and imports come from **your existing authenticated server**. No Soulseek API key, database password, or admin token is included in the APK.
- No arbitrary HTTP endpoints, SSL bypasses, WebView, browser automation, or public file-sharing permissions.
- Video metadata and thumbnails are retrieved through the authenticated Jobbi Music API. The app only opens verified HTTPS watch links in the Android browser; it does not embed video playback.
- Import only recordings you own or have permission to obtain.

## Known beta differences from the web app

Social feed/advanced admin dashboards, offline download management, real-time lyrics, and automatic cross-device synchronization have not been fully ported yet. This native beta focuses on reliable listening and the everyday library/playlist flows. Existing web app remains fully functional.

## Build locally

Requires Android SDK Platform 36, JDK 17, Gradle 8.11.1. From this directory:

```bash
gradle :app:testDebugUnitTest :app:assembleDebug
```

The APK appears in `app/build/outputs/apk/debug/app-debug.apk`.
