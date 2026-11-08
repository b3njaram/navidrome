# Jobbi Music — Navidrome frontend

A separate React + Node.js music player preview for the Synology NAS. This does not replace the current Navidrome server or modify its music library.

## Features
Apple Music-inspired dark UI, Navidrome login, album and artist browser, search, playlists, favorites, streaming player, album artwork, basic lyrics lookup, and experimental admin-only search via the existing Soulseek Downloader API.

Soulseek download actions and automated import status UI are **not enabled yet**; exact downloader request/response formats still need verification. Only acquire music you have permission to access.

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

Node.js 22+, `npm install`, `npm run check`, `npm run build`. For local development set `PUBLIC_HTTPS=false` and run `npm start` and `npm run dev` in different terminals.

The server retains login sessions in memory. Only usernames listed in `ADMIN_USERS` can invoke experimental Soulseek search; no API secrets belong in the browser or repository. Preview and production deployments should remain distinct. Image-building CI does not deploy to the NAS automatically.

## Follow-up
Inspect the existing downloader's Flask route bodies around lines 806–899 of `/app/app.py` before enabling download actions.
