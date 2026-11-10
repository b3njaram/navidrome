# Jobbi Music collection exporter

This is a **free browser userscript** for manually exporting your own Spotify or Apple Music playlist metadata. It does not transfer audio, capture streaming files, scrape credentials, or call any external Jobbi Music service.

## Installation (desktop)

1. Install a trusted userscript manager such as Violentmonkey or Tampermonkey in Chrome or Firefox.
2. Download `jobbi-collection-export.user.js` and open it with the userscript manager. Review what it does before accepting permissions.
3. Log into [Spotify Web](https://open.spotify.com/) or [Apple Music Web](https://music.apple.com/) **yourself**.
4. Open a playlist or **Liked Songs** / **Favorite Songs**. Choose its name and select **Favorites** for your saved-song collection, not for an ordinary playlist.
5. Click **Capture current collection**. The script scrolls the currently open list and gathers displayed song titles, artists, albums and source links.
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
