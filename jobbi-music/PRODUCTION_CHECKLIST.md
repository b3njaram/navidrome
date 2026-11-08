# Jobbi Music — Production security and acceptance gate

> Status: **preview candidate; no production cutover authorized until the checks below pass.**
> The current Navidrome service (port 4533) remains the music database, Subsonic API,
> and instant rollback destination.

## System boundaries

- `jobbi-music`: Node application, runs as unprivileged `node`, read-only root filesystem, dropped Linux capabilities, no Docker socket, no direct read or write access to music files.
- `jobbi-storage-agent`: single-purpose container running as UID 0 **without capabilities and without networking** because the Synology music folder is root-owned and mode 0700. It mounts `/volume1/music` read-only and only writes a nonsensitive aggregate JSON snapshot into a separate Docker volume; it cannot modify music or use the Docker API. The main app mounts that JSON cache read-only.
- Existing Navidrome, slskd and Soulseek downloader containers remain unchanged. Navidrome user-scoped authentication keeps each listener's favorites and playlists separate. Soulseek search and downloads are only available to verified, explicitly allowlisted Navidrome admins.
- Passwords are never committed to GitHub. Application sessions are process-memory-only, with randomly generated cookie IDs, HTTP-only SameSite cookies and AES-GCM encrypted password storage in the in-memory session map. Session keys are rotated on restart, which signs everyone out. State-changing endpoints require per-session CSRF tokens and origin checks.

## Release blockers that must be addressed on the actual NAS

- [ ] **Navidrome backend version and security patches:** Official release v0.64.2 (2026-09-24) follows v0.64.1, which fixed five security vulnerabilities involving Subsonic authentication, artwork, playlists, player ownership, and cross-user libraries. v0.64.0 also fixed an SQL injection vulnerability in the native API. Before enabling the public frontend, check the actually running NAS container version with `docker exec navidrome-navidrome-1 /app/navidrome --version` or inspect startup logs; require a reviewed release with these fixes. **Do not blindly pull `latest` or replace the Navidrome container.** First back up its database and music, and review the release's breaking internal-ID migration notes. References: https://github.com/navidrome/navidrome/releases and https://github.com/navidrome/navidrome/security/advisories/GHSA-hm54-32q6-3rcr.
- [ ] Rotate the previously disclosed administrator password and reauthenticate all test devices.
- [ ] Backup and verify restore for `/volume1/docker/navidrome`, `/volume1/music`, and the slskd/downloader configuration and relevant volumes. Confirm backups are available outside the NAS.
- [ ] Confirm Cloudflare Tunnel serves `https://music-preview.jobbisoft.com.mx` using HTTPS. Configure `PUBLIC_HTTPS=true` *on the public HTTPS deployment*, then redeploy only Jobbi Music. Do not expose password sign-in over public HTTP.
- [ ] Set an appropriate Cloudflare Access policy including MFA for administrators. Avoid allowing public self-registration. Test policy enforcement for the `/api/admin/*` routes.
- [ ] Verify the existing admin's Navidrome `adminRole` is `true`, and the admin username is listed in `ADMIN_USERS` in the local NAS `.env`. The allowlist alone **never** elevates someone to administrator.
- [ ] Check the `jobbi-storage-agent` volume scan status and that music size, filesystem total and free bytes match the NAS dashboard. Capacity includes other files on that volume; snapshot scans can be stale for up to 30 minutes.
- [ ] Navidrome native user-management API compatibility gate: initially keep `ENABLE_ACCOUNT_MANAGEMENT=false`. Test `/auth/login` (or `/api/authenticate`), native `GET /api/user` and `POST /api/user` against the *installed* Navidrome version with an isolated disposable listener account. Confirm that the new listener has no admin privileges and can log in. Then, after backup, verify deletion of **that disposable listener only**. Only then set `ENABLE_ACCOUNT_MANAGEMENT=true`; leave disabled if any step fails. The native API is undocumented and can change across Navidrome upgrades.
- [ ] Validate actual slskd search results and search timeouts, authorized file selection, transfer progress, downloader metadata, completed import into `/volume1/music`, and Navidrome scan. Never assume mocked tests prove that an external peer has an available file.
- [ ] Verify the original Navidrome UI remains reachable locally through Tailscale for administrators, Subsonic clients retain access to port 4533, and rollback route can be restored immediately.

## User acceptance test matrix — run on desktop Chrome and mobile Safari

| Area | Administrator | Listener |
| --- | --- | --- |
| Login/log out | correct credentials, wrong credentials, throttling, CSRF | same |
| Navigation and mobile | Home, Library, Search, Settings, Admin | Home, Library, Search, Settings only |
| Home/Library | Albums, artists, filters, paging, empty/error states | same, limited by Navidrome libraries |
| Playback | Start, pause, seek, next/previous, repeat, shuffle, long track, media controls | same |
| Audio profiles | Original/lossless when playable, 320 kbps, 128 kbps | same |
| Songs | cover art, lyrics, stars, scrobbles, queue, artwork fallback | same |
| Playlists | Create, rename, add/remove, delete with confirmation | own playlists |
| Soulseek | Search, no matches, wrong key, peer delay, progress and authorized import | all routes 403; no UI controls |
| Admin panel | User list, user role, volume usage, filesystem available space | all routes 403; no UI controls |
| Account lifecycle | Create disposable listener, login as it, verify admin denied, delete only that listener | cannot create, elevate or delete users |
| Security | Tampered CSRF, cross-origin, unauthorized cookie, disabled account feature flag, session expiry, rate limits | same |
| Reliability | Restart Jobbi Music container, confirm sign-in needed; music files remain unchanged | same |

## Tests run in CI

- `npm run check` — Node syntax.
- `npm test` — server API, authentication, role authorization, CSRF, native user management, NAS scan, slskd asynchronous behavior, streaming profiles.
- `npm audit --omit=dev --audit-level=high` — fail on high/critical runtime dependency advisories.
- `npm run build` — Vite production bundle.
- `docker build` — reproducible build compatibility (dependency lockfile still recommended).
- `npm run test:e2e` — browser-only functional smoke tests for desktop Chromium and iPhone WebKit using **mock API responses**. Browser test screenshots and traces are kept on failure.

Passing mock tests is **not** the same as testing the real NAS, Cloudflare identity controls, real library, or music file integrity.

## Safe preview update without Synology host Git

From a NAS root shell, after verifying a clean working tree:

```sh
cd /volume1/docker/jobbi-music-source
docker run --rm -v "$PWD:/repo" -w /repo alpine/git:latest -c safe.directory=/repo pull --ff-only origin feature/jobbi-music-preview
cd jobbi-music
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
curl -fsS http://127.0.0.1:3131/api/status
docker compose -f compose.yaml logs --tail=40 jobbi-storage-agent
```

Only the new Jobbi Music and storage-agent services are changed by these commands.

Then run the non-destructive hardening audit:
```sh
sh scripts/nas-security-audit.sh
```

It checks read-only Docker confinement, absence of the Docker socket, scanner network isolation, unauthenticated admin/Soulseek denial, cookie mode, and whether unvalidated account provisioning is disabled. It does not prove the entire application or NAS is free from vulnerabilities; manual penetration testing and live acceptance tests remain essential.


## Production promotion and rollback

When *all* release blockers pass and production promotion is approved:
1. In the existing Cloudflare Tunnel published application for `music.jobbisoft.com.mx`, change the service origin from `http://192.168.1.20:4533` to `http://192.168.1.20:3131`. Cloudflare continues to terminate TLS.
2. Test login as both roles, stream full audio, favorite, playlist, album artwork, search, and admin storage status from both mobile and desktop.
3. Leave the original Navidrome Docker container and library completely intact. Continue operating on 4533 internally for Subsonic API and native administration.
4. **Rollback:** Restore the Cloudflare route to `http://192.168.1.20:4533`. No database or music file restoration is needed because the new frontend uses the same existing Navidrome system.

**Compatibility:** Jobbi Music now forwards `/rest/*` requests at the original hostname to Navidrome's fixed backend origin, preserving Subsonic/OpenSubsonic clients, including existing credentials, POST requests, streaming and byte ranges. Navidrome—not Jobbi Music—still authenticates these clients. Test an existing mobile Subsonic client against the actual production hostname **before** and **after** the route change. If Cloudflare Access MFA is enabled for the hostname, arrange an explicitly reviewed path-specific exception or separate service hostname for legacy clients, because many music clients cannot solve interactive browser MFA challenges. Do **not** bypass authentication in Navidrome. 


Do not switch to production automatically on every commit. Use a protected deployment branch or manual production approval. Never attach `/var/run/docker.sock` or a privileged shell endpoint to the web server.
