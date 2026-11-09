# Production cutover: Navidrome UI → Jobbi Music

## Goal and non-goals

**Goal:** serve Jobbi Music at the current music hostname, with HTTPS from Cloudflare, without changing the music engine or moving the data.

**Do not replace** the original Navidrome Docker image, database, music share, accounts or existing personal playlists. The Navidrome container should continue running on port **4533**; Jobbi Music stays on **3131** and proxies the original `/rest/*` music-client API.

The GitHub **main** branch contains the preferred source code; it is not the live frontend until the NAS is updated and the Cloudflare route is changed.

## What survives

| Resource | Stored in | Effect of frontend switch |
| --- | --- | --- |
| Users/passwords/roles | Existing Navidrome `/data` | **Preserved.** Jobbi authenticates against the existing accounts |
| Songs, files, covers and tags | Existing `/volume1/music` | **Preserved.** Same path mounted by Navidrome |
| User favorites, play counts, personal playlists | Existing Navidrome database | **Preserved.** Same account-scoped Subsonic API |
| Friends, invitations, avatars, blends, collaborative playlists | `jobbi-social-db` Docker volume | **Preserved.** Independent PostgreSQL volume |
| slskd downloads and downloader settings | Existing slskd/downloader containers | **Preserved.** No destructive migration |
| Android offline copies | On each device | **Unaffected.** Web frontend updates don't repackage the installed APK |

A *shared social playlist* is stored separately from a user's native Navidrome playlist. Sharing an existing personal playlist creates a **separate social copy**. Don't confuse that copy with a destructive data migration.

## Before touching production

- Verify Jobbi's local health endpoint returns JSON and can successfully log in, browse albums, play an entire song, show lyrics, and add a song to a real Navidrome playlist.
- Confirm a second ordinary user has their own favorites and playlists, not the admin's.
- Test the Community invitation create/accept workflow and its PostgreSQL persistence after an app restart.
- Check that `GET /rest/ping.view` and streaming work through the Jobbi preview hostname with an existing trusted Subsonic client; this is important for existing mobile clients.
- Back up `/volume1/docker/navidrome`, `/volume1/music`, the Jobbi PostgreSQL volume and all `.env` files. Check backups and preserve copies outside the NAS. Never run `docker compose down -v`.
- Review the running Navidrome version and its current security advisories; update the backend only in its own controlled, reversible change.
- Ensure your NAS has enough free disk space and don't expose PostgreSQL, slskd, or the downloader's API publicly.

**Simple read-only checks on the NAS:**

```sh
docker ps --filter name=navidrome --filter name=jobbi-music --filter name=jobbi-social-db
curl -fsS --max-time 10 http://127.0.0.1:3131/api/status
curl -fsS --max-time 10 http://127.0.0.1:8383/api/health
```

### HTTPS through Cloudflare Tunnel

Cloudflare terminates **HTTPS** for users and forwards requests through the encrypted tunnel to the NAS **HTTP** listener. This is a supported Cloudflare Tunnel design; you do **not** need to install a self-signed certificate in Jobbi or change the Node app to listen on HTTPS.

1. First add a temporary **Published application** hostname such as `music-preview.jobbisoft.com.mx` with the service URL `http://192.168.1.20:3131`. Keep `music.jobbisoft.com.mx` pointing to Navidrome's `http://192.168.1.20:4533` during testing.
2. On the NAS, adjust the **local, uncommitted** `jobbi-music/.env` to set `PUBLIC_HTTPS=true`. Protect it with `chmod 600 .env`. Do not add passwords/tokens or real secrets to GitHub. Recreate **only** `jobbi-music` using the tested local compose file. 
3. Verify `https://music-preview.jobbisoft.com.mx` loads, login succeeds and the browser receives an HttpOnly **Secure** session cookie. Remember: a Secure cookie will **not** work for sign-in at `http://nasjobbi:3131`; use the HTTPS hostname for web login afterward. Your original Navidrome login on 4533 remains available over Tailscale/LAN.
4. From an ordinary user and an administrator, test the app. Check no mixed-content errors, test actual audio ranges, cover art, lyrics, social playlists, Soulseek imports, and legacy `/rest/*` clients.
5. When the live tests and backups are verified, edit the **existing** Cloudflare published application route for `music.jobbisoft.com.mx`: switch **only** its service URL from `http://192.168.1.20:4533` to `http://192.168.1.20:3131`. Keep the hostname unchanged; bookmarked client URLs keep working.
6. Inspect Cloudflare WAF and rate limits, and consider MFA for administrator access. If you enable an interactive Cloudflare Access policy over the whole hostname, remember it may break clients using `/rest/*` that cannot pass a browser-based challenge.
7. Keep `navidrome-navidrome-1` running and reachable on the NAS internally. Do not delete its files, database, or config.

Reference: [Cloudflare published-app routing](https://developers.cloudflare.com/tunnel/concepts/routing/). An HTTP origin in the published application is compatible with HTTPS for visitors.

### Rollback

If the production interface fails, **restore the original Cloudflare hostname service URL** to `http://192.168.1.20:4533`. This is an immediate frontend routing rollback, not a database restore. Users, personal playlists and audio will still reside in Navidrome, and social data remains in the separate Jobbi volume. If the Jobbi app itself needs a rollback, restore its prior tested Docker image while preserving all volumes.

### Updater branch after promotion

The NAS auto-deploy script currently follows `feature/jobbi-music-preview` for continuous testing. **Do not automatically point your production NAS at every commit on `main`** until releases and backups have been exercised. Prefer a protected release branch or pinned tested commit, with explicit approval before updates. Merging a pull request into GitHub `main` does not change your NAS container by itself.

### Repeated notices and import behavior

Discover now uses concise, functional copy rather than repeating warnings throughout the UI. Import validation, permissions, CSRF and disk-rate limits remain enforced server-side.

If the custom Soulseek downloader returns **409: already in your Music folder**, the application stores a distinct "already on NAS" signal instead of treating the recording as a failed transfer. This is based on the downloader's tag/index check: the actual filename may differ from the searched title. **Don't re-download a known duplicate.** Navidrome must confirm a match before it becomes a playable entry in the import tracker.
