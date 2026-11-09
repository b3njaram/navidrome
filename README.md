# Jobbi Music

**A personal, self-hosted music experience with Navidrome at its core.**

Jobbi Music is the primary web and Android experience for this music server. Navidrome remains the source of truth for your users, music collection, artists, albums, favorites and personal playlists; Jobbi Music provides a modern interface on top of its OpenSubsonic API.

## What Jobbi Music includes

- Responsive dark interface, animated playback and full-screen now playing with synchronized lyrics and queue controls
- Your existing Navidrome library and login credentials, native album/artist navigation, streaming-quality choices
- Native Android application with offline music downloads
- Social profiles, friends, collaborative playlists with accepted invitations, public/private playlists and blends
- Soulseek discovery and monitored NAS import jobs, plus optional Invidious discovery/import service
- Administrator tools, account-management capability gating, storage monitoring and per-user import limits
- Cloudflare Tunnel-compatible HTTPS deployment, with no direct public NAS port required

**The music remains yours to operate.** Neither a GitHub merge nor a frontend deployment migrates or rewrites the Navidrome database or the audio library. Social features persist separately in the Jobbi PostgreSQL volume.

## Architecture

```text
Browser / Android application
          |
          | HTTPS (Cloudflare Tunnel, after public launch)
          v
       Jobbi Music                  Port 3131 (HTTP behind tunnel)
          |  \
          |   +-- jobbi-social-db   Friends, profiles, shared playlists
          |
          +------ Navidrome         Port 4533 — library/users/personal playlists
          |        /rest/* clients remain compatible
          |
          +------ Soulseek downloader + slskd
          |        Audio files in the existing NAS music share
          |
          +------ Optional Invidious search / audio importer
```

## Source and releases

The application source is in [jobbi-music/](jobbi-music/) and its [setup guide](jobbi-music/README.md). Desktop and mobile automated tests run through GitHub Actions. The **main** branch is the public source of the Jobbi Music project. Before deploying to your own NAS, review the [production checklist](jobbi-music/PRODUCTION_CHECKLIST.md).

A GitHub code update is **not** itself a Cloudflare or NAS deployment. The Cloudflare hostname can be promoted only after health, login and real-streaming checks are successful.

## Upgrade without losing your library

The recommended strategy is **frontend replacement, not Navidrome replacement**:

1. Keep the existing Navidrome container, its `/data` volume and the `/volume1/music` share untouched.
2. Back up your Navidrome data, the existing music share and Jobbi's `jobbi-social-data` volume, and verify that backups are restorable.
3. Deploy and test Jobbi Music on its existing internal URL and a temporary HTTPS hostname.
4. On the NAS only, set `PUBLIC_HTTPS=true` once the public HTTPS tunnel is ready. Cloudflare provides browser TLS and proxies to `http://NAS-LAN-IP:3131`. No certificate or HTTPS listener inside the Node container is needed.
5. Update the existing Cloudflare route for your music hostname from Navidrome's port 4533 to Jobbi Music's port 3131. **Keep Navidrome running on 4533** so the backend and other apps continue working.
6. Keep an immediate rollback route: point Cloudflare back to port 4533 if any user login, playback, artwork or `/rest/` client fails.

See [the production cutover guide](docs/production-cutover.md).

## Security principles

Authenticated Navidrome sessions, HttpOnly cookies, CSRF protections, security headers, backend-side import quotas and limited container privileges. Never commit `.env` secrets, expose PostgreSQL or the downloader to the internet, or mount the Docker socket into the frontend. Review NAS and Cloudflare access restrictions before public exposure.

Jobbi Music is a community-developed interface, not affiliated with Navidrome or Apple.
