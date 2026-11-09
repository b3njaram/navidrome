#!/bin/sh
# Opt-in worker only. Keeps Navidrome, Soulseek and PostgreSQL untouched.
set -eu
cd /volume1/docker/jobbi-music-source/jobbi-music
[ -f .env ] || { echo "Missing .env. Install Jobbi Music first."; exit 1; }
command -v openssl >/dev/null || { echo "openssl is needed to generate a worker token"; exit 1; }
umask 077
if ! grep -q '^INVIDIOUS_URL=' .env;then
  printf '\nINVIDIOUS_URL=https://yt.jobbisoft.com.mx\n' >> .env
fi
if ! grep -q '^INVIDIOUS_WORKER_URL=' .env;then
  printf 'INVIDIOUS_WORKER_URL=http://jobbi-invidious-worker:8091\n' >> .env
else
  sed -i 's|^INVIDIOUS_WORKER_URL=.*|INVIDIOUS_WORKER_URL=http://jobbi-invidious-worker:8091|' .env
fi
if ! grep -q '^INVIDIOUS_WORKER_SECRET=[A-Za-z0-9]\{32,\}' .env;then
  TOKEN="$(openssl rand -hex 32)"
  if grep -q '^INVIDIOUS_WORKER_SECRET=' .env;then
    sed -i "s|^INVIDIOUS_WORKER_SECRET=.*|INVIDIOUS_WORKER_SECRET=$TOKEN|" .env
  else
    printf 'INVIDIOUS_WORKER_SECRET=%s\n' "$TOKEN" >> .env
  fi
fi
chmod 600 .env
DIR='/volume1/music/Jobbi Imports'
if [ ! -d "$DIR" ];then
  mkdir -p "$DIR"
  chown 1000:100 "$DIR"
fi
if ! docker run --rm --user 1000:100 -v "$DIR:/imports" alpine:3.21 sh -c 'test -w /imports';then
  echo "Import directory is not writable by UID 1000 GID 100."
  echo "Review Synology permissions for this directory; do not chmod the entire music library."
  exit 1
fi
docker compose -f compose.yaml --profile invidious-import config --quiet
docker compose -f compose.yaml --profile invidious-import up -d --build jobbi-invidious-worker jobbi-music
docker compose -f compose.yaml --profile invidious-import ps
docker exec jobbi-invidious-worker python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5)))"
echo "Optional Invidious importer enabled. Import only audio you have rights to use."
