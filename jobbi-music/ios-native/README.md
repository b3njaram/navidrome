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

The original NAS library is not modified when downloading to the iPhone. Local downloads are stored per account/server in Application Support. This first iPhone version does not duplicate all advanced Android admin controls or bulk import flows; those remain accessible through the website.

## IPA installation and signing

GitHub Actions compiles the simulator app and produces an artifact called JobbiMusic-UNSIGNED.ipa. That file is useful to verify a genuine native iPhone build, but is NOT installable on an ordinary iPhone. Apple requires code signing and provisioning. In Xcode, configure Signing & Capabilities and archive/export a Development or Ad Hoc IPA using your own Apple team/profiles, or use App Store Connect/TestFlight for eligible developers. Registered-device provisioning applies to Ad Hoc installs.

Never put signing keys, certificate .p12 files, provisioning profiles or passwords in the repository. Unit tests and unsigned builds are not a replacement for real iPhone tests against the running production NAS, especially for streaming, cached cookies, background playback and remote song import reliability.

## Test on Mac

Run Product > Test on a compatible iOS Simulator, or inspect the Jobbi Music native SwiftUI iOS GitHub Actions build. Tests cover server URL checks, music/playlist JSON data, recommendation parsing, peer filename filtering, scrobble thresholds and real image processing.

## Design

Apple's Human Interface Guidelines and Liquid Glass favor standard TabView, NavigationStack, toolbar, text controls and sheet components. This app uses glass only for the navigation/control layer rather than painting every list or album with translucent overlays. Text scales with Dynamic Type and appearance follows system light/dark settings.
