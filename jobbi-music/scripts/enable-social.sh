#!/bin/sh
# Set up Jobbi Music social services without printing or rotating existing secrets.
# Use a root SSH shell on the Synology NAS.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
fi
chmod 600 .env

if ! grep -q '^SOCIAL_DB_PASSWORD=.' .env; then
  # A preexisting data volume must never be paired with a newly generated
  # password. That would break access to the already-initialized database.
  if docker volume ls --format '{{.Name}}' | grep -qE '(^|_)jobbi-social-data$' ||
     docker ps -a --format '{{.Names}}' | grep -qx 'jobbi-social-db'; then
    echo "ERROR: Social data exists but the password is missing. Preserve the database and recover the original secret."
    exit 1
  fi

  PASSWORD="$(docker run --rm --network none node:22-alpine node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  if [ "${#PASSWORD}" -ne 64 ]; then
    echo "ERROR: Unable to generate a secure database password."
    exit 1
  fi

  umask 077
  TMP="$(mktemp .env.social.XXXXXX)"
  trap 'rm -f "$TMP"' 0 1 2 3 15
  grep -v '^SOCIAL_DB_PASSWORD=' .env > "$TMP" || true
  printf 'SOCIAL_DB_PASSWORD=%s\n' "$PASSWORD" >> "$TMP"
  chmod 600 "$TMP"
  mv "$TMP" .env
  unset PASSWORD
  trap - 0 1 2 3 15
  echo "Generated a private social database secret in .env."
else
  echo "Reusing the existing social database password."
fi

docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build

echo "=== Jobbi Music services ==="
docker compose -f compose.yaml ps

echo "=== Local API ==="
curl -fsS --max-time 15 http://127.0.0.1:3131/api/status
echo
echo "Social features deployed to the preview container."
