#!/bin/sh
# One-shot promotion of the CURRENT Jobbi Music checkout to HTTPS Cloudflare.
# No Navidrome, slskd, music-share, or PostgreSQL volume deletion/migration.
set -eu
umask 077
ROOT=/volume1/docker/jobbi-music-source
APP="$ROOT/jobbi-music"
BACKUPS="/volume1/docker/jobbi-music-backups"
LOCK="$ROOT/.git/jobbi-auto-deploy.lock"
DOMAIN=music.jobbisoft.com.mx
cd "$APP" || exit 1
if [ "$(id -u)" != 0 ];then echo 'Run with sudo -i first.';exit 1;fi
if ! [ -r /dev/tty ];then echo 'An interactive terminal is required for the Cloudflare token.';exit 1;fi
test -s .env || { echo 'Missing Jobbi Music .env; refusing to deploy.';exit 1; }
command -v docker >/dev/null || { echo 'Docker is not available';exit 1; }
command -v curl >/dev/null || { echo 'curl is not available';exit 1; }
if [ "${JOBBI_GO_LIVE_ALREADY_LOCKED:-0}" = '1' ];then
  [ -d "$LOCK" ] || { echo 'Expected parent updater lock not found';exit 1; }
  trap 'stty echo < /dev/tty 2>/dev/null || true' EXIT HUP INT TERM
else
  if ! mkdir "$LOCK" 2>/dev/null;then
    echo 'Another Jobbi updater is running, or a stale lock exists. No changes made.'
    exit 1
  fi
  trap 'stty echo < /dev/tty 2>/dev/null || true; rmdir "$LOCK" 2>/dev/null || true' EXIT HUP INT TERM
fi
mkdir -p "$BACKUPS"
chmod 700 "$BACKUPS"

echo '=== SAFETY PREFLIGHT ==='
# Do not create/replace volumes, accounts or original music containers.
docker inspect jobbi-music >/dev/null
docker inspect jobbi-social-db >/dev/null
docker inspect navidrome-navidrome-1 >/dev/null
if ! docker exec jobbi-social-db pg_isready -U jobbi_social -d jobbi_social >/dev/null 2>&1;then
  echo 'Social database not healthy; public promotion stopped.';exit 1
fi
if ! curl -fsS --max-time 8 http://127.0.0.1:4533/rest/ping.view >/dev/null 2>&1;then
  # OpenSubsonic returns 401 JSON/XML for unauthenticated requests.
  if ! curl -sS -o /dev/null --max-time 8 http://127.0.0.1:4533/;then
    echo 'Navidrome 4533 is unreachable; no changes made.';exit 1
  fi
fi
echo 'Navidrome and Jobbi social database are present.'

echo
echo '=== CLOUDFLARE CREDENTIALS (entered locally, never sent to chat) ==='
printf 'Cloudflare Account ID (32 hex characters): ' > /dev/tty
IFS= read -r CF_ACCOUNT_ID < /dev/tty
printf 'Cloudflare Tunnel UUID (36 characters): ' > /dev/tty
IFS= read -r CF_TUNNEL_ID < /dev/tty
printf 'Short-lived Cloudflare Tunnel Edit API token (hidden): ' > /dev/tty
stty -echo < /dev/tty
if ! IFS= read -r CF_API_TOKEN < /dev/tty;then
  stty echo < /dev/tty
  echo 'Cloudflare token entry failed.';exit 1
fi
stty echo < /dev/tty
printf '\n' > /dev/tty

cf_api(){
  printf '%s' "$CF_API_TOKEN" | docker run --rm -i \
    -e CF_ACCOUNT_ID="$CF_ACCOUNT_ID" -e CF_TUNNEL_ID="$CF_TUNNEL_ID" \
    -v "$APP/scripts:/app:ro" \
    -v "$BACKUPS:/backups:rw" \
    node:22-alpine node /app/cloudflare-cutover.mjs "$1"
}
# Confirm the token can READ the EXACT currently configured hostname BEFORE
# touching the application or overwriting any Cloudflare ingress.
echo '=== VERIFYING REMOTE CLOUDFLARE ROUTE ==='
cf_api check

echo '=== BACKING UP JOBBI CONFIG AND SOCIAL DB ==='
STAMP="$(date '+%Y%m%d-%H%M%S')"
ENV_BACKUP="$BACKUPS/jobbi-env-$STAMP"
SOCIAL_BACKUP="$BACKUPS/jobbi-social-$STAMP.dump"
cp -p .env "$ENV_BACKUP"
chmod 600 "$ENV_BACKUP"
if ! docker exec jobbi-social-db pg_dump -U jobbi_social -d jobbi_social --format=custom > "$SOCIAL_BACKUP";then
  rm -f "$SOCIAL_BACKUP"
  echo 'Social database backup failed; aborting before deployment.';exit 1
fi
chmod 600 "$SOCIAL_BACKUP"
echo 'Backed up .env and PostgreSQL social data in the NAS shared Docker folder.'

echo '=== ENABLE CLOUD HTTPS SESSION COOKIES ==='
if grep -q '^PUBLIC_HTTPS=' .env;then
  sed -i 's/^PUBLIC_HTTPS=.*/PUBLIC_HTTPS=true/' .env
else
  printf '\nPUBLIC_HTTPS=true\n' >> .env
fi
chmod 600 .env
if ! docker compose -f compose.yaml config --quiet;then
  cp -p "$ENV_BACKUP" .env
  echo 'Compose invalid; original .env restored. Cloudflare not changed.';exit 1
fi

echo '=== BUILD ONLY THE JOBBI FRONTEND ==='
if ! docker compose -f compose.yaml build jobbi-music;then
  cp -p "$ENV_BACKUP" .env
  echo 'Build failed; original .env restored. Cloudflare not changed.';exit 1
fi
echo '=== RESTART ONLY JOBBI FRONTEND ==='
if ! docker compose -f compose.yaml up -d --no-deps --no-build jobbi-music;then
  echo 'Container start/recreate failed. Cloudflare remains on Navidrome.'
  echo 'Previous .env backup: ' "$ENV_BACKUP"
  exit 1
fi

echo '=== HEALTH CHECK ==='
HEALTHY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12;do
  if curl -fsS --max-time 5 http://127.0.0.1:3131/api/status;then
    HEALTHY=1
    break
  fi
  sleep 3
done
if [ "$HEALTHY" -ne 1 ];then
  echo 'Jobbi health check failed; Cloudflare NOT changed.'
  echo 'Inspect docker logs --tail=90 jobbi-music';exit 1
fi
echo
echo '=== VERIFY NAVIDROME IS STILL LISTENING ==='
if ! curl -sS -o /dev/null --max-time 8 http://127.0.0.1:4533/;then
  echo 'Navidrome now unreachable; Cloudflare NOT changed.';exit 1
fi

echo '=== SWITCH EXACT CLOUDFLARE HOSTNAME ==='
# Existing ingress is backed up; other hostnames/originRequest settings untouched.
cf_api switch
unset CF_API_TOKEN
echo
echo '=== PRODUCTION RESULTS ==='
docker compose -f compose.yaml ps
echo
echo "Cloudflare public hostname: https://$DOMAIN"
echo 'Original Navidrome for Tailscale clients: http://nasjobbi:4533'
echo 'HTTPS uses Cloudflare at the edge and HTTP to Jobbi on the private LAN.'
echo 'Secure login cookies now require the HTTPS public hostname.'
echo 'Other services, Navidrome data and NAS audio files were NOT changed.'
echo
echo 'PUBLIC WEBSITE QUICK CHECK:'
if ! curl -fsS --max-time 15 "https://$DOMAIN/api/status";then
  echo 'A public HTTPS check was blocked or returned an error.'
  echo 'Verify Cloudflare Access and inspect the tunnel; restore the previous origin'
  echo 'http://192.168.1.20:4533 from Cloudflare if the browser login fails.'
fi
echo
echo 'Finished. Test both admin and listener accounts in the HTTPS browser.'
