# Jobbi Music · Native iPhone

This is a native SwiftUI iOS 26.1+ app, not a WebView. It uses Apple's system Liquid Glass floating tab bar and mini-player, AVPlayer streaming, MediaPlayer lock-screen controls, Keychain credentials, Photos picker, and a responsive NavigationStack interface.

## Build on a Mac

1. Install Xcode 26.6 or newer and XcodeGen (brew install xcodegen).
2. Open a terminal at jobbi-music/ios-native and run xcodegen generate.
3. Open JobbiMusic.xcodeproj, select the JobbiMusic scheme, choose your Development Team in Signing & Capabilities.
4. Run on an iPhone simulator or a registered iPhone and sign in with your Navidrome username and password.

The app defaults to https://music.jobbisoft.com.mx and requires HTTPS. Account credentials stay in Keychain only if the listener selects Keep me signed in.

## Feature coverage

Native tabs for Listen Now, Search, Library, Community and Settings. Albums, playlists, Favorites, personalized weekly/monthly and time-of-day mixes, optional city weather mix, original-file offline downloads, AVPlayer with Control Center/lock screen, signed-in Soulseek discovery and NAS import requests, shared playlist browsing, friends and profile editing, and native profile/album/playlist photo upload. User-chosen photos are downsampled using ImageIO and converted to valid JPEG under 1 MiB; no GPS access needed.

## New in 1.1.0

- Every song has Play Next, Add to Queue, Add to Playlist, Favorite, and individual offline download. Now Playing has an editable Up Next screen to move, remove, jump and clear future songs, plus Shuffle, Repeat One and a sleep timer.
- Playlist tracks can be removed from the playlist (PATCH /api/playlists/:id with removeIndex) without removing the recording from the NAS.
- Remove recording from NAS is a separate, explicitly confirmed operation. The iPhone requests /api/songs/:id/removal-impact, shows other listeners' visible references (never private playlist names), and requires typing REMOVE and posting a server-issued ticket to /api/songs/:id/quarantine. This is only available when the isolated, opt-in NAS quarantine worker is enabled. Otherwise no audio is removed.
- Find New Music searches Soulseek and, independently, the authenticated /api/invidious/search alternate source. Audio import is only enabled when the NAS Invidious worker reports importEnabled.
- Verified administrators see the native Admin Console in Settings: indexed song/album counts, storage and user stats, scan trigger, account listing and optional listener management. The backend independently authorizes all mutations.
- Library and Settings expose Download all playlists; playlist screens and Favorites offer their own downloads. Each unique song is saved only once on the device and the UI reports progress and errors. The iPhone preserves the recording's real .flac, .mp3, .m4a and other supported extensions rather than a generic .audio file.
- The Listen Now call-to-action now has opaque white background and black text for clear contrast.

The original NAS library is not modified when downloading to the iPhone. Local downloads are private to each account and server in Application Support and excluded from iCloud backups. A queued import is not proof of a playable song. These code paths have automated tests, but real NAS permissions, FLAC compatibility, HTTPS cookies and background downloads must still be verified on a signed physical iPhone. The advanced web-based bulk import and some account controls may remain web-only.

## IPA installation and signing

GitHub Actions compiles the simulator app and produces an artifact called JobbiMusic-UNSIGNED.ipa. That file is useful to verify a genuine native iPhone build, but is NOT installable on an ordinary iPhone. Apple requires code signing and provisioning. In Xcode, configure Signing & Capabilities and archive/export a Development or Ad Hoc IPA using your own Apple team/profiles, or use App Store Connect/TestFlight for eligible developers. Registered-device provisioning applies to Ad Hoc installs.

Never put signing keys, certificate .p12 files, provisioning profiles or passwords in the repository. Unit tests and unsigned builds are not a replacement for real iPhone tests against the running production NAS, especially for streaming, cached cookies, background playback and remote song import reliability.

## Test on Mac

Run Product > Test on a compatible iOS Simulator, or inspect the Jobbi Music native SwiftUI iOS GitHub Actions build. Tests cover server URL checks, music/playlist JSON data, recommendation parsing, peer filename filtering, scrobble thresholds and real image processing.

## Design

Apple's Human Interface Guidelines and Liquid Glass favor standard TabView, NavigationStack, toolbar, text controls and sheet components. This app uses glass only for the navigation/control layer rather than painting every list or album with translucent overlays. Text scales with Dynamic Type and appearance follows system light/dark settings.
