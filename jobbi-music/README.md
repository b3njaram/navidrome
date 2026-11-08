# Jobbi Music — Navidrome frontend

A separate React + Node.js music player preview for the Synology NAS. This does not replace the current Navidrome server or modify its music library.

## Features
Apple Music-inspired dark UI, Navidrome login, album and artist browser, search, playlists, favorites, streaming player, album artwork, basic lyrics lookup, and administrator-only Soulseek search, a confirmed-download form, transfer monitoring, playlist management, and a request to rescan the music library.

Soulseek downloads are now queued via the existing custom Flask downloader at `/api/download` and transfers are read at `/api/downloads`. **Important:** the request body uses the inferred fields `username,filename,size,artist,title` based on your earlier NAS output. The live Flask handler has NOT yet been reviewed; verify it before considering Soulseek production-ready. Only acquire music you have permission to access.

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

## Release validation — DO NOT SKIP

This version is a **release candidate**, not an independently verified production deployment. CI uses mock Navidrome and downloader services, not your live Synology containers.

Before changing the original music domain:
1. Back up the NAS volumes for Navidrome settings/database (`/volume1/docker/navidrome`), the library (`/volume1/music`), and Soulseek downloader settings/data; confirm a restore method.
2. With the preview running, sign in and out on mobile Safari and desktop. Play a full track longer than three minutes; test seek, next, previous, favorites, lyrics and playlists, including add/remove/rename/delete.
3. Inspect the Flask handler at `/app/app.py` lines 806–899 inside your `soulseek-downloader` container and compare its actual `/api/search` and `/api/download` fields with this integration. Do not enable automated/unattended imports until both are verified.
4. Manually test a small **authorized** audio download, verify its transfer status, final location under `/volume1/music`, and ability to search and play it in Navidrome. Validate audio metadata and lyrics. The player does **not** stream directly from Soulseek peers.
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
