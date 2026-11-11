#!/bin/sh
# Opt-in NAS storage access only. Does not remove or modify any music files.
set -eu
[ "${JOBBI_ACK_STORAGE_WRITE:-}" = YES ] || {
  echo 'Refusing to enable NAS file modifications without JOBBI_ACK_STORAGE_WRITE=YES'
  exit 1
}
APP=/volume1/docker/jobbi-music-source/jobbi-music
cd "$APP"
[ -f .env ] || { echo 'Missing local .env. Set up Jobbi Music first.'; exit 1; }
[ -d /volume1/music ] || { echo 'Missing /volume1/music'; exit 1; }
uid="$(sed -n 's/^QUARANTINE_UID=//p' .env | tail -n 1)"
gid="$(sed -n 's/^QUARANTINE_GID=//p' .env | tail -n 1)"
uid="${uid:-1000}"
gid="${gid:-100}"
case "$uid:$gid" in *[!0-9:]*|'')echo 'QUARANTINE_UID and QUARANTINE_GID must be numeric';exit 1;;esac
if [ "$uid" = 0 ];then
  echo 'Use a dedicated non-root NAS account with read/write music permissions.'
  exit 1
fi
# Test share access before changing configuration. No music files are touched.
if ! docker run --rm --user "$uid:$gid" --entrypoint sh \
  -v /volume1/music:/music:rw node:22-alpine -c 'test -r /music && test -w /music';then
  echo 'The dedicated worker account cannot write /volume1/music.'
  echo 'Grant this UID read/write access through Synology DSM shared-folder ACL first.'
  exit 1
fi
setenv(){
  key="$1"; value="$2"
  if grep -q "^$key=" .env;then
    sed -i "s|^$key=.*|$key=$value|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}
secret="$(sed -n 's/^MUSIC_QUARANTINE_SECRET=//p' .env | tail -n 1)"
if [ "${#secret}" -lt 32 ];then secret="$(openssl rand -hex 32)";fi
cp -p .env ".env.before-quarantine.$(date +%Y%m%d_%H%M%S)"
setenv MUSIC_QUARANTINE_SECRET "$secret"
setenv MUSIC_QUARANTINE_URL 'http://jobbi-quarantine:3137'
setenv QUARANTINE_UID "$uid"
setenv QUARANTINE_GID "$gid"
chmod 600 .env
docker compose --profile quarantine -f compose.yaml config --quiet
docker compose --profile quarantine -f compose.yaml up -d jobbi-quarantine
docker compose -f compose.yaml up -d --build --no-deps jobbi-music
echo 'Quarantine enabled: only authenticated and verified Jobbi admins can request reversible NAS removal.'
echo 'Quarantined recordings remain in /volume1/music/.jobbi-quarantine with recovery JSON manifests.'
