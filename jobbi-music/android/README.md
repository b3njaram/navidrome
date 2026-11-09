# Jobbi Music for Android

This is a native Android shell using the **same live React interface** as Jobbi Music. It contains a private, on-device downloads library and Media3-based offline playback.

- Requires Android 8.0+ (API 26).
- The default server is `http://nasjobbi:3131` over the user's private Tailscale/LAN; HTTPS domains are supported from the connection settings.
- Only your current Navidrome account's authorized tracks can be saved, using that user's HttpOnly session cookie.
- Android DownloadManager downloads persist with the app and finish in the background; no broad storage permission is requested. Saved audio is removed when the app is uninstalled.
- Downloads are grouped by the authenticated account and kept on the local device, with no public sharing of saved files.
- Offline player uses Media3 playback service for Android media session / background audio controls.
- WebView is restricted to the configured trusted origin and uses origin-validated AndroidX WebMessageListener rather than unrestricted addJavascriptInterface.
- HTTP is allowed **only** for the known private NAS host/IP; for access over the internet configure the server as HTTPS.
- Build via GitHub Actions workflow `jobbi-android-apk.yml`; downloadable debug APK is test-signed and not appropriate for Play Store publication. For stable release updates, set up a securely stored release signing key in GitHub Actions.

Install by opening the APK on Android and allowing installation from that trusted source. Set the server if your DNS differs. Sign in, tap the download symbol beside a song, and open **Offline** for locally saved songs.

Offline downloads are **device-specific** and not a sync or bypass of Navidrome permissions. This is not a redistribution/DRM circumvention tool.
