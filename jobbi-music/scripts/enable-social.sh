#!/bin/sh
# Jobbi Music: initialize the social database credentials without printing them.
# This script affects only Jobbi Music and its dedicated social database.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
fi
chmod 600 .env

if ! grep -q '^SOCIAL_DB_PASSWORD=.' .env; then
  if docker volume ls --format '{{.Name}}' | grep -qE '(^|_)jobbi-social-data
    echo "ERROR: Social database already exists but its password is missing. Do not generate a new password for an existing database."
    exit 1
  fi
  PASSWORD="$(docker run --rm --network none node:22-alpine node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  if [ "${#PASSWORD}" -ne 64 ]; then
    echo "ERROR: Could not generate a secure social database password."
    exit 1
  fi
  umask 077
  TMP="$(mktemp .env.social.XXXXXX)"
  trap 'rm -f "$TMP"' EXIT HUP INT TERM
  grep -v '^SOCIAL_DB_PASSWORD=' .env > "$TMP" || true
  printf 'SOCIAL_DB_PASSWORD=%s\n' "$PASSWORD" >> "$TMP"
  chmod 600 "$TMP"
  mv "$TMP" .env
  unset PASSWORD
  trap - EXIT HUP INT TERM
  echo "New social database credential stored in local .env (not displayed)."
else
  echo "Using existing social database credential; no password rotated."
fi

docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build

echo "=== Containers ==="
docker compose -f compose.yaml ps
echo "=== Jobbi Music ==="
curl -fsS --max-time 15 http://127.0.0.1:3131/api/status
echo
echo "Community setup complete. Sign in and open Community."
 || docker ps -a --format '{{.Names}}' | grep -qx 'jobbi-social-db'; then
    echo "ERROR: Social database already exists but its password is missing. Do not generate a new password for an existing database."
    exit 1
  fi
  PASSWORD="$(docker run --rm --network none node:22-alpine node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  if [ "${#PASSWORD}" -ne 64 ]; then
    echo "ERROR: Could not generate a secure social database password."
    exit 1
  fi
  umask 077
  TMP="$(mktemp .env.social.XXXXXX)"
  trap 'rm -f "$TMP"' EXIT HUP INT TERM
  grep -v '^SOCIAL_DB_PASSWORD=' .env > "$TMP" || true
  printf 'SOCIAL_DB_PASSWORD=%s\n' "$PASSWORD" >> "$TMP"
  chmod 600 "$TMP"
  mv "$TMP" .env
  unset PASSWORD
  trap - EXIT HUP INT TERM
  echo "New social database credential stored in local .env (not displayed)."
else
  echo "Using existing social database credential; no password rotated."
fi

docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build

echo "=== Containers ==="
docker compose -f compose.yaml ps
echo "=== Jobbi Music ==="
curl -fsS --max-time 15 http://127.0.0.1:3131/api/status
echo
echo "Community setup complete. Sign in and open Community."
