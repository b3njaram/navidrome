#!/bin/sh
# Jobbi Music non-destructive NAS pre-production audit.
# Run from the jobbi-music directory. Never prints API keys or passwords.
set -eu
fail=0
pass(){ printf 'PASS: %s\n' "$1"; }
warn(){ printf 'REVIEW: %s\n' "$1"; }
bad(){ printf 'FAIL: %s\n' "$1";fail=1; }
if ! command -v docker >/dev/null 2>&1;then bad 'Docker CLI unavailable';exit 1;fi
if ! docker compose -f compose.yaml config --quiet;then bad 'Compose validation';exit 1;else pass 'Compose configuration parses';fi
if docker inspect jobbi-music >/dev/null 2>&1;then
  info="$(docker inspect -f '{{.State.Running}} {{.HostConfig.ReadonlyRootfs}} {{.Config.User}}' jobbi-music)"
  case "$info" in
    'true true node') pass 'Frontend running as unprivileged node with read-only root filesystem';;
    *) bad 'Frontend isolation does not match expected profile';;
  esac
  drops="$(docker inspect -f '{{json .HostConfig.CapDrop}}' jobbi-music)"
  case "$drops" in *ALL*)pass 'Frontend Linux capabilities dropped';;*)bad 'Frontend capabilities not fully dropped';;esac
  mounts="$(docker inspect -f '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' jobbi-music)"
  if printf '%s' "$mounts"|grep -qE 'docker\.sock|/volume1/music';then bad 'Unexpected sensitive mount on frontend';else pass 'No Docker socket or music library mounts on frontend';fi
else
  bad 'Jobbi Music frontend not created'
fi
if docker inspect jobbi-storage-agent >/dev/null 2>&1;then
  mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' jobbi-storage-agent)"
  if [ "$mode" = none ];then pass 'Storage scanner network disabled';else bad 'Storage scanner has network access';fi
  rootfs="$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' jobbi-storage-agent)"
  if [ "$rootfs" = true ];then pass 'Storage scanner root filesystem read only';else bad 'Storage scanner root filesystem writable';fi
  caps="$(docker inspect -f '{{json .HostConfig.CapDrop}}' jobbi-storage-agent)"
  case "$caps" in *ALL*)pass 'Storage scanner drops all capabilities';;*)bad 'Storage scanner capabilities not dropped';;esac
else
  bad 'Storage scanner missing'
fi
if curl -fsS --max-time 8 http://127.0.0.1:3131/api/status >/dev/null;then pass 'Local API healthy';else bad 'Local API unavailable';fi
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3131/api/admin/overview || true)"
if [ "$code" = 401 ];then pass 'Admin API rejects unauthenticated requests';else bad "Admin API returned unexpected HTTP $code";fi
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3131/api/soulseek/downloads || true)"
if [ "$code" = 401 ];then pass 'Soulseek API rejects unauthenticated requests';else bad "Soulseek endpoint returned unexpected HTTP $code";fi
if [ -f .env ];then
  if grep -q '^ENABLE_ACCOUNT_MANAGEMENT=true' .env;then warn 'Native account creation ENABLED: confirm live API canary + backup';else pass 'Unsafe account provisioning disabled by default';fi
  if grep -q '^PUBLIC_HTTPS=true' .env;then pass 'HTTPS-only cookie flag set in .env';else warn 'HTTP preview cookie setting; do not use as public production login';fi
else bad 'Missing application .env';fi
if [ "$fail" -eq 0 ];then printf '\nStatic NAS security audit passed. Live browser, auth, import, restore and CDN tests remain required.\n';else printf '\nOne or more checks failed. Do not promote to production.\n';fi
exit "$fail"
