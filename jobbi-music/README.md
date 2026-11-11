## Download full playlists and Favorites

**Website:** In **Your Library**, use **Download playlist** on any playlist card or **Download all playlists** in the heading. The Favorites screen has **Download all Favorite songs**. The browser receives a streamed, original-audio **ZIP archive** (FLAC/MP3/etc. exactly as in Navidrome), organized into separately numbered playlist folders. Song names are sanitized for safe cross-platform ZIP extraction, and repeated recordings appearing in different playlists remain in each playlist's folder. Archives are limited to 10,000 track entries / 250 playlists per request; if over the limit, download individual playlists instead. The download never deletes or alters NAS recordings. Allow time and sufficient local storage for large archives.

**Native Android APK v1.0.5:** Use the download icon on each playlist, the **Download all playlists** button in Library, or **Download all** on Favorites. Confirm whether transfers should wait for Wi-Fi (default) or use mobile data. The Android OS queues actual original-quality recordings into **device-private music storage**, continues transfers in the background, and automatically skips files already queued or downloaded even when they occur in multiple playlists. **More → Offline downloads** displays completed/queued/failed counts. Saved recordings are preferred during playback, and the **Downloaded music** screen can play those recordings offline even if the server cannot be reached, when secure remembered sign-in is enabled. Failed queued transfers (for example if the 12-hour server session expires) can be retried by downloading the collection again after logging in; already completed tracks are skipped. Avoid clearing app data/uninstalling if you wish to keep downloaded files.

The website downloads portable ZIP files; the native APK saves music for offline playback, rather than producing one large ZIP. Both download from the user's existing, authenticated Navidrome library — not from Soulseek peer search.

# Jobbi Music — Navidrome frontend

A separate React + Node.js music player preview for the Synology NAS. This does not replace the current Navidrome server or modify its music library.

## Features
Apple Music-inspired dark UI, Navidrome login, album and artist browser, search, playlists, favorites, streaming player, album artwork, basic lyrics lookup, and administrator-only Soulseek search, a confirmed-download form, transfer monitoring, playlist management, and a request to rescan the music library.

Soulseek downloads are now queued via the existing custom Flask downloader at `/api/download` and transfers are read at `/api/downloads`. **Important:** the request body uses the inferred fields `username,filename,size,artist,title` based on your earlier NAS output. The live Flask handler has NOT yet been reviewed; verify it before considering Soulseek production-ready. Only acquire music you have permission to access.

## Shared song removal for all authenticated listeners (APK v1.0.4 and web)

Every signed-in listener can now use the **trash icon next to a song** in search results, Favorites, album views and playlists. Selected-song bulk removal also works for ordinary listeners (up to 20 tracks per review). This is intentionally different from **Remove from playlist**, which changes only the playlist entry.

Before the shared audio file can be moved, the app requests `GET /api/songs/:id/removal-impact` and displays what is known: "You have this song in Favorites Mix" or "bob has this song in Public Mix". References in private social playlists **not shared with the requester** are counted and warned about without revealing their owners, titles or IDs. A user's own Favorites are checked too. Other users' private Navidrome playlists and Favorites cannot all be enumerated, so the warning explicitly states that some references may be unknown.

The user must type **REMOVE** in the confirmation dialog. The app then presents the short-lived review ticket to `POST /api/songs/:id/quarantine`. The backend rechecks the shared playlist references immediately before accepting the ticket, refuses stale reviews, serializes concurrent removals of the same song, limits each account to 20 successful removals per day, and moves the file to recoverable quarantine via the isolated worker. If the social database or accessible playlist check is unavailable, removal fails safely and nothing moves. This does **not** permanently delete files or erase the playlists themselves, but it can make other users' saved songs unplayable.

The worker still must be explicitly enabled on the NAS; normal browsers and the Android APK never gain direct NAS filesystem access. Do not disable the shared impact check when changing permissions. Accounts still need to be signed in to Jobbi Music, and private playlist names remain protected.

## Playlist management and reversible NAS recording removal

Jobbi Music's native Android APK (v1.0.2) and web app support selecting multiple tracks. **Long-press** a track on Android or mobile web, or choose **Select songs** / **Select all** to select a collection. Actions include favorite/unfavorite, copy into a playlist, move between playlists (copies first, then removes original entries), and remove entries from a playlist without deleting audio. Favorites has a **Shuffle Favorites** button.

The **Remove recordings from NAS** action is only shown to verified Jobbi Music administrators. This is not ordinary playlist removal: it moves actual audio files out of the indexed library. Its separate worker is **disabled by default**. Other users cannot mount music folders or use that endpoint.

### Enable opt-in NAS quarantine on Synology

Only do this after reviewing and backing up your music files and verifying the intended account has storage permissions. This is a distinct opt-in Docker worker; the main Jobbi container **still has no writable music volume**. The worker listens only on the Docker network, not on a public host port, and refuses symbolic links, path traversal, and non-audio file extensions.

1. In DSM, give a dedicated, non-root UID/GID read/write access to the music shared folder. Set `QUARANTINE_UID` and `QUARANTINE_GID` in the local `/volume1/docker/jobbi-music-source/jobbi-music/.env` (defaults are 1000 and 100). Never store passwords or secrets in GitHub.
2. SSH into the NAS and run:

```sh
sudo env JOBBI_ACK_STORAGE_WRITE=YES sh /volume1/docker/jobbi-music-source/jobbi-music/scripts/enable-quarantine.sh
```

The script checks read/write access **without modifying music**, generates or reuses a local secret, preserves a backup of `.env`, starts the separate worker, and rebuilds Jobbi Music. It refuses to run with root UID or without explicit acknowledgement. If the DSM permissions are insufficient, it stops and explains the blocker; it will not silently gain elevated access.

3. Open a song in the app, select it, choose **Remove recordings from NAS**, and confirm. The file moves to `/volume1/music/.jobbi-quarantine/` with a `<random-id>-filename` and a `<random-id>-filename.json` recovery manifest recording the original relative path. It is **not** permanently deleted; an administrator can restore it manually. A `.ndignore` marker stops Navidrome from scanning the quarantine folder. The API requests a Navidrome scan, but depending on your scanner settings, old missing-file metadata might remain visible until a full scan or purge.

To disable future removals, remove `MUSIC_QUARANTINE_URL` and `MUSIC_QUARANTINE_SECRET` from your local `.env` and rebuild **only** Jobbi Music. You can then stop the opt-in `jobbi-quarantine` container. Do not move quarantine files back into the active library without checking their recovery manifest.

### When a music search is empty

The initial search tab queries **Navidrome's already-indexed music**. It is not a Soulseek search. If you type **Algo Está Cambiando — Julieta Venegas** and get no library matches, choose **Search this song on server** / **Soulseek · New music**. This searches peers with the same phrase and can also show an Invidious alternative. Try `Julieta Venegas cambiando` or `Algo Esta Cambiando` if the full accented query does not find anything.

The UI distinguishes **request failed**, **no peers answered**, and **peers answered but returned no supported audio**. All three states are different; none proves the recording is absent from the entire network. The app cannot determine remote peer availability from GitHub CI alone.

## Social community — friends, playlists, blends and profiles

The **Community** tab is available to every signed-in Navidrome user. Social information is stored in a **dedicated PostgreSQL 17 container** called `jobbi-social-db`, with a private `jobbi-social-data` Docker volume. It has **no published database port**, no Docker socket mount and no access to the music folder. Navidrome remains the source of truth for music, credentials and personal playlists.

- **Friends:** Users appear in search after signing into Jobbi Music once. Send requests, accept or decline, view accepted friends and unfriend. Unfriending revokes their shared-playlist access and removes any mixes that contain both users' contributed favorite tracks.
- **Profiles:** Upload or remove JPEG, PNG or WebP pictures (max 1 MB), customize display name and bio, and opt out of user discovery. Only authenticated users can view other profiles; undiscoverable profiles stay unavailable to nonfriends.
- **Statistics:** Profiles show the number of **visible social playlists created** and **songs the user contributed to visible social playlists**. These are privacy-filtered social contributions, **not** all the user's private Navidrome playlists, download history, or entire library.
- **Collaborative playlists:** Create a new social playlist, or **import a copy** of an existing Navidrome playlist. Set it **private** (owner and explicitly invited members only) or **public** (visible to all signed-in Jobbi Music users, not anonymous internet visitors). Share with accepted friends as either **viewer** or **editor**. Editors may add or remove songs; only owners can change visibility, edit details, add/remove collaborators, or delete the playlist. Individual tracks retain `added_by` attribution. Imported copies are not kept in sync with the originals.
- **Playlist links:** Copy a link of the form `https://music.jobbisoft.com.mx/?community=<playlist-id>`. A private link **never** bypasses membership checks; recipients must be logged in and explicitly invited.
- **Blends:** Both accepted friends must deliberately opt in by using **Share my favorites for blends**. The app takes up to 100 starred songs from each participating user's Navidrome account and alternates distinct tracks in a **private** blend. Either participant can refresh. Opting out deletes their saved blend contributions and the blends they participated in. Existing listening history is never published, and blends cannot be made public.

### Install/enable the persistent social database on Synology

First update the existing `feature/jobbi-music-preview` checkout (see update commands below). From your root SSH session on `nasjobbi`, execute:

```sh
cd /volume1/docker/jobbi-music-source/jobbi-music
sh scripts/enable-social.sh
```

The script generates a random 64-character PostgreSQL password inside your local `.env` (mode `600`) **without displaying the secret**, or reuses the existing one. It then validates and rebuilds Jobbi Music and starts the dedicated database. It **does not** stop, modify or replace Navidrome, Soulseek, or your music files. The social database uses a persistent named volume and survives future application rebuilds. Never run `docker compose down -v` because that removes named data volumes.

All social API requests require Navidrome login. Mutation routes reuse the app's session-based CSRF defenses, validate permissions in the backend, and rate-limit account changes. Direct database and audio-file access is not exposed to browsers.

### Back up social data

Run on the Synology root shell, storing snapshots inside a shared folder:

```sh
mkdir -p /volume1/docker/jobbi-music-backups
docker exec jobbi-social-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U jobbi_social -d jobbi_social --format=custom' \
  > "/volume1/docker/jobbi-music-backups/social-$(date +%Y%m%d-%H%M%S).dump"
```

Test that a backup can be restored to a **separate** PostgreSQL instance before relying on it. Never restore over live social data without a maintenance plan. Keep an off-NAS backup as protection against NAS failure.

**New database and social app are still a preview feature** until you verify the real NAS, backup/restore, two separate Navidrome accounts, playlist access controls, and Cloudflare HTTPS. GitHub CI exercises social behavior with a temporary PostgreSQL service and a browser with mocked music APIs, not your live NAS.

## Administrator / listener permissions and production release gate

Jobbi Music authenticates users against the **existing Navidrome accounts**, rather than creating a parallel user database. The full role matrix, live acceptance tests, security controls, backup steps and rollback procedure are maintained in [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

- Administrator means **both** an existing Navidrome account with `adminRole=true` **and** an exact username in the NAS-only `ADMIN_USERS` environment allowlist. Admin authorization is reverified against Navidrome for admin requests.
- Listeners can use their own library, playback, favorites and playlists; admin and Soulseek actions are server-restricted. There is no unauthenticated public registration.
- The admin console shows user roles and counts, NAS total/used/free space, audio-only track bytes/count, and total `/volume1/music` folder size. These are aggregate read-only periodic measurements, not live per-file browser access.
- Native account administration defaults to disabled (`ENABLE_ACCOUNT_MANAGEMENT=false`) until explicitly tested against the *installed* Navidrome native API on the NAS. Creating users is possible from the admin UI only after compatibility and backup validation, and always creates a listener without elevated privileges.
- Production requires `PUBLIC_HTTPS=true` **and a working HTTPS endpoint**. It prevents cookie-based login over plain Tailscale HTTP; use the HTTPS Cloudflare hostname or Tailscale Serve HTTPS in production.
- Never mount Docker socket or a NAS root shell into the public app. The storage scanner has no network, only a read-only music volume, and drops all Linux capabilities. The Node app cannot read or write the actual music filesystem.
- All GitHub CI browser tests use mocked services; they cannot establish real Synology authorization, Cloudflare Access, actual disk statistics, full song playback or Soulseek imports.

## Preview on the NAS

```sh
git clone https://github.com/b3njaram/navidrome.git
cd navidrome/jobbi-music
cp .env.example .env
vi .env        # set ADMIN_USERS and verify service URLs
docker compose up -d --build
docker compose logs --tail=100 jobbi-music
```

The app listens on **3131**. Add a new Cloudflare Tunnel hostname `music-preview.jobbisoft.com.mx` targeting `http://192.168.1.20:3131`. **Do not change `music.jobbisoft.com.mx`.**

For **HTTP on Tailscale/LAN**, set `PUBLIC_HTTPS=false` (the preview default); this allows cookies to work over HTTP. For an **HTTPS-only public deployment**, set `PUBLIC_HTTPS=true` in `.env`, then rebuild the app. Do not expose the login page to the public internet over HTTP. Helmet's CSP keeps its other protections but does not force HTTP asset requests onto HTTPS. A LAN status check is at `http://192.168.1.20:3131/api/status`.

Until this branch is merged, clone it with `git clone --branch feature/jobbi-music-preview https://github.com/b3njaram/navidrome.git`. After merging, use the normal clone command above.

To stop only the preview: `docker compose down`.

## Development

Node.js 22+, `npm install`, `npm run check`, `npm test`, `npm run build`. GitHub Actions also builds the Docker image and runs mocked API integration tests. For local development set `PUBLIC_HTTPS=false` and run `npm start` and `npm run dev` in different terminals.

The server retains login sessions in memory. Only usernames listed in `ADMIN_USERS` can invoke experimental Soulseek search; no API secrets belong in the browser or repository. Preview and production deployments should remain distinct. Image-building CI does not deploy to the NAS automatically.

## Follow-up
Inspect the existing downloader's Flask route bodies around lines 806–899 of `/app/app.py` before enabling download actions.

## Soulseek search — why an empty [] happens

The original frontend forwarded a single search to the Python downloader. slskd works asynchronously: starting a search returns a search ID, and peer responses arrive later. An empty immediate response isn't proof no music exists. The updated direct-slskd integration starts a search, polls responses, filters non-audio files, deduplicates, sorts by relevance and quality, and displays a useful empty state.

Direct search is **optional but recommended**. In `jobbi-music/.env` set:
```env
SLSKD_URL=http://192.168.1.20:5030
SLSKD_API_KEY=YOUR_EXISTING_PRIVATE_SLSKD_API_KEY
```
Create or obtain a **search-capable** API key through your existing slskd setup. Do not paste secrets into ChatGPT, commit them to GitHub, or put them into the browser. Docker Compose passes the key only to the server container. The app exposes neither key nor authentication tokens to clients. The original custom downloader still handles download/imports.

If the running `soulseek-downloader` container already has an `SLSKD_API_KEY` environment variable, an administrator on the NAS can transfer its value privately into the local `.env` without displaying the key:

```sh
cd /volume1/docker/jobbi-music-source/jobbi-music
test -f .env || cp .env.example .env
key="$(docker exec soulseek-downloader sh -c 'printf %s "$SLSKD_API_KEY"')"
if [ -z "$key" ]; then
  echo "Existing downloader has no SLSKD_API_KEY environment variable; obtain a search-capable slskd API key from your admin settings."
else
  tmp="$(mktemp .env.XXXXXX)"
  grep -vE '^(SLSKD_URL|SLSKD_API_KEY)=' .env > "$tmp" || true
  printf 'SLSKD_URL=http://192.168.1.20:5030\nSLSKD_API_KEY=%s\n' "$key" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env
  unset key
fi
docker compose -f compose.yaml up -d --build
```

Searches are admin-only and temporary; the app cleans up only its own slskd search ID. Direct mode is selected only when both URL and key are configured. An unconfigured fallback continues to query the existing downloader and tells you when its results are empty rather than displaying raw `[]`.

If **direct mode** returns no results, check that slskd is connected to Soulseek, that peers are online, and try more specific or alternate-language titles. For the band Kino, try `Кино` or `Виктор Цой`.

## Release validation — DO NOT SKIP

This version is a **release candidate**, not an independently verified production deployment. CI uses mock Navidrome and downloader services, not your live Synology containers.

Before changing the original music domain:
1. Back up the NAS volumes for Navidrome settings/database (`/volume1/docker/navidrome`), the library (`/volume1/music`), and Soulseek downloader settings/data; confirm a restore method.
2. With the preview running, sign in and out on mobile Safari and desktop. Play a full track longer than three minutes; test seek, next, previous, favorites, lyrics and playlists, including add/remove/rename/delete.
3. Inspect the Flask handler at `/app/app.py` lines 806–899 inside your `soulseek-downloader` container and compare its actual `/api/search` and `/api/download` fields with this integration. Do not enable automated/unattended imports until both are verified.
4. Manually test a small **authorized** audio download, verify its transfer status, final location under `/volume1/music`, and ability to search and play it in Navidrome. Validate audio metadata and lyrics. The player does **not** stream directly from Soulseek peers. Direct slskd search is tested with mocked peer responses but needs a live NAS API key and connection verification.
5. For publicly reachable domains, use Cloudflare HTTPS, enable appropriate Cloudflare Access policies and set `PUBLIC_HTTPS=true` in `.env`. Restart the new Jobbi Music service after changes. **Do not expose Navidrome credentials on cleartext public HTTP.** For your private HTTP Tailscale preview keep `PUBLIC_HTTPS=false`.
6. Use the preview subdomain until tests have passed. The GitHub workflow tests/builds code but **does not deploy to the NAS** and does not change your existing Cloudflare route.

## Updating the preview on Synology without system Git

Run from a root shell on the NAS:

```sh
cd /volume1/docker/jobbi-music-source
docker run --rm -v "$PWD:/repo" -w /repo alpine/git:latest -c safe.directory=/repo pull --ff-only origin feature/jobbi-music-preview
cd jobbi-music
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
curl -fsS http://127.0.0.1:3131/api/status
```

For a failure, check `docker compose -f compose.yaml logs --tail=100 jobbi-music` and [GitHub Actions](https://github.com/b3njaram/navidrome/actions). This update only rebuilds the Jobbi Music preview container.

## API routes

Navidrome: `/api/home`, `/api/search`, `/api/star`, `/api/playlists` (GET/POST), `/api/playlists/:id` (PATCH/DELETE), `/api/stream/:id`, `/api/cover/:id`, `/api/lyrics/:id`, `/api/scrobble`.

Authorized administrators only: `/api/soulseek/search`, `/api/soulseek/download`, `/api/soulseek/downloads`, `/api/library/scan`. No slskd secrets or downloader tokens are stored in browser code. A `jobbi_session` cookie is HTTP-only; application sessions are stored in process memory and signing in again is required after container restart.

## Social listening (friends, blends and shared playlists)

The **Community** tab now provides private social features backed by a separate PostgreSQL database. Navidrome remains the music library and account identity provider; this database stores only profile pictures, profile details, friend requests, sharing permissions, playlist metadata, song references, and explicit blend picks. There is no public registration.

- Search discoverable users, send and approve friend requests, remove friends, and choose whether your profile appears in search.
- Upload a PNG/JPEG/WebP profile picture (up to 1 MB), change your display name and biography, and browse other users' visible profiles.
- View playlists created by each user and the number of tracks they contributed to playlists **you are allowed to see**. Private playlist titles and contribution totals are not leaked to unauthorized viewers.
- Create social playlists with **private** (default) or **public** visibility. Public means visible to **signed-in Jobbi Music users**, not anonymous visitors or the entire internet. Only owners can change visibility or delete playlists.
- Invite accepted friends to private playlists, give them read-only or editing permission, and revoke access at any time. Friends can collaborate by adding tracks from the shared Navidrome library. Friendship alone never grants private-playlist access.
- Import an existing Navidrome playlist as a separate social copy. The original playlist is not modified by collaboration.
- Create a private blend with a friend after **both** explicitly opt in to sharing a snapshot of their favorites. Either person can opt out, which deletes their shared blends. Listening history is not exposed.

**Deployment:** Social data requires the `jobbi-social-db` service and `SOCIAL_DB_PASSWORD` in your NAS-only `.env` file. Use a randomly generated, long password. Never commit this secret. Start with `docker compose -f compose.yaml up -d --build`, and include the `jobbi-social-data` Docker volume in regular backups. Do not delete that volume during rebuilds. See `scripts/enable-social.sh` for a guided one-time setup.

**Limits:** Social playlists are stored separately from Navidrome-native playlists. Sharing a playlist grants access to its song list, not direct access to someone else's Navidrome credentials. Actual playback is still subject to each listener's Navidrome permissions and library availability.


## Now Playing: music-first fullscreen controls and lyrics

Tap the mini-player artwork, song title or artist to open the immersive Now Playing screen. The design uses original glass, artwork-driven gradients, fast tactile transitions, and a motion-reduction fallback. Controls include seek, queue, shuffle, repeat, favorites, add-to-playlist, song detail sharing, and Android offline download.

Use **Lyrics** to display embedded or sidecar lyrics from Navidrome. Synchronized lines highlight based on the current playback position; tapping a timestamped line seeks to that position. If only plain lyrics exist, they're displayed without fabricated timing. If no lyrics are present, the player explains how to add sidecar `.lrc` files beside music tracks. The frontend never scrapes copyrighted lyric sites or injects third-party ads.

## Auto-updating the NAS preview (one-time opt-in)

Only the *preview branch* `feature/jobbi-music-preview` is eligible. The production site `music.jobbisoft.com.mx` is **not** automatically replaced. The updater uses outbound GitHub access from Synology, no incoming webhook, no publicly exposed NAS SSH or Docker socket, and no GitHub access token. It refuses local changes and requires successful GitHub Actions **build** and **browser-smoke** checks at the exact target commit SHA before deploying. It keeps the previous image and restores it when the updated `/api/status` health check fails.

First install the current preview normally and make sure its `/api/status` passes:

```sh
cd /volume1/docker/jobbi-music-source
docker run --rm -v "$PWD:/repo" -w /repo alpine/git:latest -c safe.directory=/repo pull --ff-only origin feature/jobbi-music-preview
cd jobbi-music
docker compose -f compose.yaml up -d --build
curl -fsS http://127.0.0.1:3131/api/status
```

Then, **on Synology DSM**, open **Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script**. Run as a NAS administrator who can access Docker; schedule every 30 minutes (or daily, if preferred). Use exactly this script command:

```sh
sh /volume1/docker/jobbi-music-source/jobbi-music/scripts/nas-auto-deploy.sh
```

Run it once manually before enabling the schedule. Logs and state are held inside the existing Git checkout's `.git/` folder so they cannot make the working tree dirty. It updates **only** `jobbi-music`, not your music files, PostgreSQL volumes, Navidrome container, or Cloudflare DNS. For a production site, use a manual promotion gate with verified backups and real-device acceptance tests. Keep a branch protection rule requiring GitHub Actions checks; an admin with write access to the trusted branch can deploy code to the NAS.

If the updater reports GitHub API rate limits or unavailable Docker images, it should **not** deploy; inspect `.git/jobbi-auto-deploy.log` and confirm the GitHub Actions results.

## Android in-app update checker and signed releases

Android v1.1.0 checks `/api/android/latest` at most once per 24 hours and offers a user-controlled link to the **official GitHub release page** when a newer *signed* APK exists. It never silently installs software. You can also check using the Android toolbar settings → **Check for updates**. The API only trusts public `android-vMAJOR.MINOR.PATCH` GitHub releases for `b3njaram/navidrome` and APK assets from that repository.

**The debug APKs from normal CI are not automatically published as official releases** and may have a different signing identity. To publish stable updateable releases, create and safely back up your private Android keystore; add GitHub Actions repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Never put signing keys, passwords or keystores in GitHub commits, screenshots, logs, or chats. Then create an appropriately protected tag matching the Android `versionName`, e.g. `android-v1.1.0`. The `jobbi-android-release.yml` workflow fails closed if signing secrets are missing, builds a release APK, and publishes it with a SHA-256 digest as an official release asset.

For real long-term updates, use the **same release signing key** and package identifier across releases. An existing preview debug build with application ID `com.jobbisoft.music.debug` is separate from the release app `com.jobbisoft.music`. Downloads from a debug app are not automatically migrated to a release installation.

### Android Auto and CarPlay status

- **Android Auto:** the Android app now advertises a driver-safe Media3 `MediaLibraryService` that browses **locally downloaded songs** by the currently selected Navidrome user. Android Auto supplies its own playback interface and transport controls; don't interact with the phone while driving. Car availability still requires validation on a compatible car or the Android Automotive Desktop Head Unit test tool. Debug/sideloaded apps might not automatically be shown by Android Auto, and store distribution requires Google's car-app checks. Live Navidrome streaming is not yet integrated with this native car library.
- **Apple CarPlay:** Android APKs cannot run on iOS or CarPlay. Support requires a separately built, signed native iOS audio app with the relevant Apple CarPlay capability and testing, which is outside the Android project.



## Discover 2.0 — Soulseek + Invidious fallback

**Discover → Soulseek · New music** now searches the configured slskd peers **and** a configured Invidious instance concurrently. If slskd returns zero peer responses, Invidious results are shown as a separate source, not disguised as Navidrome music. Artist and album names in Navidrome track lists open the matching local catalog pages. An artist page loads the first 18 albums' real track lists (up to 360 songs); long discographies may require opening additional albums.

**All authenticated listeners can queue supported Soulseek audio files** directly to the existing NAS downloader without administrator approval. Imports are validated server-side, protected by CSRF and session authentication, and subject to a fresh read-only NAS capacity snapshot: at least 4 GiB free **plus** the recording's declared size, max 350 MiB per track, 20 tracks / 2 GiB per user per day, and 80 tracks / 10 GiB across the shared library per day. The importer rejects duplicates that have been queued recently. Status reads for normal users show only their own import metadata. These checks do not bypass licensing requirements; import only material you're authorized to retain.

### Diagnose slskd reporting "connected" but zero search peers

Connected to the central Soulseek server does not imply receiving peer search results. In the NAS terminal, check slskd's listening port and logs (no API key should be pasted publicly):

```sh
docker ps --filter name=slskd
docker logs --tail=100 slskd
```

Review TCP **50300** forwarding and the NAS firewall, slskd Settings → Soulseek → distributed network, and test the same phrase in the native slskd web interface. slskd documents that a missing inbound listening port can limit discoverability and search results. Jobbi now polls the normal response endpoint and also tries embedded responses on the search state API to accommodate delayed result persistence. The search UI reports whether peers answered and offers Invidious results independently.

### Configure Invidious discovery

Defaults to your preferred **`https://yt.jobbisoft.com.mx`** instance, using only its Invidious JSON API `/api/v1/search`. No browser cookies or login tokens are forwarded to it. Optional fallback instances can be set as a comma-separated HTTPS list in the NAS-only `.env`:

```ini
INVIDIOUS_URL=https://yt.jobbisoft.com.mx
INVIDIOUS_BACKUPS=https://inv.nadeko.net
```

Each Invidious result is labeled as a **video** and links to its original instance. Invidious APIs may be unavailable, throttled, or restricted: a configured instance is not evidence that its search works. You can check your own endpoint from the NAS with `curl -fS 'https://yt.jobbisoft.com.mx/api/v1/search?q=Luis%20Miguel&type=video'` (do not paste any private tokens). If you get HTML instead of a JSON array, fix the reverse proxy / Invidious API before relying on it.

### Optional, direct Invidious audio imports

The Invidious search fallback works without a new container. To also offer **Import audio** on those video cards, explicitly opt in to a separate small audio-worker service:

```sh
cd /volume1/docker/jobbi-music-source/jobbi-music
sh scripts/enable-invidious-import.sh
```

The setup generates a random private worker token in `.env`, creates **only** `/volume1/music/Jobbi Imports` if necessary, checks write permissions for UID 1000 / GID 100, and starts `jobbi-invidious-worker`. It does **not** expose the worker's port, mount the Docker socket, or write outside the dedicated import folder. The worker receives only a validated video ID and downloads the corresponding audio through yt-dlp/ffmpeg, with one-video output, 15-minute maximum duration, 180 MiB size limit, 4 GiB free reserve, a bounded concurrent queue, and user confirmation that they have permission. The backend imposes an additional limit of 5 fallback imports per user per day and 40 across the library per day. Jobs persist in `/volume1/music/Jobbi Imports/.jobbi-state`, though downloads may fail when upstream video formats change or are restricted. The worker does not bypass DRM or paywalls. Do **not** use this feature to copy copyrighted recordings without permission.

Post-deployment check (from the Jobbi Music container's logged-in browser): open Discover, enter an artist, press **Search music sources**, and verify either peer audio, alternative Invidious videos, or a clear source-specific error message. Once workers download a file, ask Navidrome to scan the library; administrators can use **Scan library** in the Discover transfer panel.

Existing Navidrome, slskd, social PostgreSQL, and Android APK installations remain unchanged by web-only UI updates. If a Synology DSM auto-update task is installed, it updates only the Jobbi frontend; it does **not** automatically enable optional worker profiles.


## Import progress and collaborative playlist invitations

### Soulseek import tracker

Discover → Soulseek → **My NAS imports** now displays per-user stages: **Queued → Downloading → Indexing → In library**. It queries the existing NAS downloader's `/api/downloads` endpoint and matches its job identifier or an unambiguous peer/filename. When the downloader provides percentages, Jobbi shows a progress bar. A completed transfer alone is **not** proof that the song has entered Navidrome; the server verifies title/artist through the user's authenticated Navidrome catalog before showing **Ready to play**. Unknown or missing downstream statuses remain explicit, e.g. **Transfer not confirmed**, instead of suggesting success. Jobbi checks every 12 seconds while Discover is open.

If a transfer displays **Needs attention**, inspect the NAS-only custom downloader and slskd logs:

```sh
curl -fsS http://127.0.0.1:8383/api/health
curl -fsS http://127.0.0.1:8383/api/downloads
docker logs --tail=70 soulseek-downloader
```

Do not retry a `needs_review` import blindly: the original transfer may already have been accepted despite a timeout. The tracker never exposes other users' entire downloader queue through the normal listener API.

### Invite collaborators

Go to **Friends → Playlists → Create shared playlist**. Enter the playlist name, optional description, and public/private visibility. Enter up to 12 registered Jobbi Music usernames to invite, choose whether they can add and remove songs, and create the playlist. Invitations are stored in PostgreSQL and require each recipient's **acceptance** before granting access.

Recipients can accept or decline under **Friends → Playlist invitations** or **Playlists → You're invited to collaborate**. Existing playlists have **Invite someone to this playlist** and **Pending invitations** sections. Owners can revoke pending invitations, remove collaborators, and switch between editing and listen-only permissions. Only the playlist owner can send invitations or modify access. Friends are convenient suggestions, but you may invite another registered user by exact username; they need to have visited Community at least once so their social profile exists.

Private playlists remain private while invitations are pending. The social PostgreSQL schema migrates additively: existing members and tracks are preserved.
