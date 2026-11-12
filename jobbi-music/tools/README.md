# Jobbi Music collection exporter

This is a **free browser userscript** for manually exporting your own Spotify or Apple Music playlist metadata. It does not transfer audio, capture streaming files, scrape credentials, or call any external Jobbi Music service.

## Installation (desktop)

1. Install a trusted userscript manager such as Violentmonkey or Tampermonkey in Chrome or Firefox.
2. Download the current **v1.3.0** `jobbi-collection-export.user.js` from Jobbi Music → **Import music** and open it with the userscript manager. Review what it does before accepting permissions. If you installed an older version, replace/update that installed userscript; downloading the new file alone does not update the script currently running on Apple Music or Spotify.
3. Log into [Spotify Web](https://open.spotify.com/) or [Apple Music Web](https://music.apple.com/) **yourself**.
4. Open a playlist or **Liked Songs** / **Favorite Songs**. Choose its name and select **Favorites** for your saved-song collection, not for an ordinary playlist.
5. Verify the purple exporter panel says **exporter v1.3.0**, then click **Capture current collection**. The script scrolls the currently open list and gathers displayed song titles, artists, albums and source links.
6. Open another playlist and repeat. The exporter remembers the collections in that browser's userscript storage.
7. Click **Download all as JSON** to get one `jobbi-music-collections-YYYY-MM-DD.json` file.
8. Upload that file in Jobbi Music → **Import music** on the website, or **More → Import track list → Import multiple playlists & Liked Songs (JSON)** in the native Android app.

## What happens on import

- Favorites are saved as hearted songs in Navidrome, **not** a "Liked Songs" playlist.
- Each standard collection becomes its own Navidrome playlist; song membership is kept separate.
- Jobbi Music first searches tracks already in Navidrome, then looks for high-confidence FLAC (or MP3 when no suitable FLAC exists) through its existing NAS Soulseek connection.
- Songs labeled Live, Remix, Demo, Karaoke, Cover and other differing editions are rejected when they weren't in your source metadata.
- The NAS's per-user import quotas still apply; authorize downloads only when you have rights to obtain the recordings.
- New downloads won't be shown as available until Navidrome indexes them. Use **Recheck** / **Update download progress** after indexing.
- The web importer stores resumption state in your browser under your Jobbi user account. You can export a detailed status report.

## Limitations

- The script reads the webpage's **rendered UI** and scrolls its **visible list**. Music services change their HTML and sometimes use virtual scrolling; check counts and partial-capture warnings.
- Some Apple Music views do not expose full artist/album fields. Use the Music desktop application's **File → Library → Export Playlist** when available.
- Browser scripting or automatic scraping may be restricted by the provider's terms. Review and comply with the applicable terms. Prefer official user-data exports or licensed integrations when available.
- This tool does **not** download Spotify or Apple Music recordings, bypass DRM, or guarantee availability of any track from your NAS downloader.
- A Spotify Premium or Apple Music subscription does not by itself grant a right to download and permanently store a separate recording.

## If the exporter reports zero songs

1. Open the actual **playlist's song list** at `music.apple.com` or `open.spotify.com` in desktop Firefox or Chrome. Confirm the titles and artists have appeared on the page, rather than viewing a playlist cover or overview.
2. In Violentmonkey/Tampermonkey, make sure the installed Jobbi Music script says **v1.3.0**, is **enabled**, and the Jobbi exporter panel actually appears on the provider page. If it says v1.1.0 or older, reinstall the current exporter from Jobbi Music or from [the raw GitHub userscript](https://raw.githubusercontent.com/b3njaram/navidrome/main/jobbi-music/tools/jobbi-collection-export.user.js).
3. Refresh the provider page, leave the playlist open, and try **Capture current collection** again. If it still fails, the on-screen error now reports `possible rows`, `with a title and artist`, and the scroll container used. Share those diagnostic numbers plus a screenshot of the playlist list for the next layout fix. Do not send cookies or login credentials.
4. **Download all as JSON** only when the saved playlist count looks correct. Old saved collections remain in the exporter until you clear or replace them.

The Jobbi Music **website** provides the userscript and accepts its exported JSON. The **native Android APK** accepts the combined JSON from its Import track list flow. The browser userscript itself runs in a supported desktop browser with Violentmonkey or Tampermonkey, **not inside the Android APK**. A website/backend deployment does not automatically update a userscript you previously installed from a local file.

### Apple Music repeated-row export fix (v1.3.0)

The exporter ignores nested duplicate DOM track rows and detects repeated three-at-a-time capture artifacts. If you already exported with an older script and the JSON contains the same song three times consecutively, the Jobbi Music website can repair that pattern when you upload the original JSON or CSV again. Intentionally repeated song entries remain supported when they are distinguishable. Always verify the collection count after export.

### Automatic import fallback

While the website Import music page is open, choose **I have permission to obtain and store recordings**, then **Process remaining songs** (or **Check next**). For tracks absent from Navidrome, the importer selects a verified Soulseek **FLAC**, otherwise **MP3**, otherwise a verified Invidious video. The NAS's standard quota and storage rules still apply. Invidious audio imports require the optional NAS Invidious worker to be enabled; otherwise the track is flagged for review instead of marked downloaded. After indexing, queued songs are automatically rechecked and added to the target playlist or Favorites while the page stays open.
