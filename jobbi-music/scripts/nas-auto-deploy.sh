#!/bin/sh
# NAS-side updater for the preview ONLY. Run periodically in Synology Task Scheduler.
# No inbound ports, GitHub tokens, webhooks or Docker socket are exposed to the internet.
set -eu
ROOT=/volume1/docker/jobbi-music-source
APP="$ROOT/jobbi-music"
BRANCH=main
# Production updates require explicit enablement after go-live. An existing DSM
# scheduled task running this script becomes a no-op by default, never reverting
# a release to the former preview branch.
if [ "${JOBBI_AUTO_DEPLOY_PRODUCTION:-0}" != '1' ];then
  echo 'Jobbi Music production auto-update is disabled (manual reviewed releases).'
  exit 0
fi
LOCK="$ROOT/.git/jobbi-auto-deploy.lock"
LOG="$ROOT/.git/jobbi-auto-deploy.log"
STATE="$ROOT/.git/jobbi-auto-deployed"
mkdir -p "$ROOT"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Another Jobbi Music update is already in progress."
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT HUP INT TERM
cd "$ROOT"
log(){ printf '%s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }
gitclient(){ docker run --rm -v "$ROOT:/repo" -w /repo alpine/git:latest -c safe.directory=/repo "$@"; }
if [ ! -d "$ROOT/.git" ];then log "Missing Git checkout. Run the manual installation first.";exit 1;fi
if [ -n "$(gitclient status --porcelain)" ];then log "Local changes found; refusing to overwrite NAS files.";exit 1;fi
gitclient fetch --no-tags origin "$BRANCH"
SHA="$(gitclient rev-parse FETCH_HEAD)"
HEAD="$(gitclient rev-parse HEAD)"
[ "$SHA" != "$HEAD" ] || exit 0
if [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$SHA" ];then exit 0;fi
# GitHub checks are public. Require BOTH CI jobs at the exact commit SHA.
# "All checks passed" must not be inferred from a commit's mere existence.
CHECKS="$(mktemp "$ROOT/.git/checks.XXXXXX")"
trap 'rm -f "$CHECKS"; rmdir "$LOCK" 2>/dev/null || true' EXIT HUP INT TERM
curl --fail --silent --show-error --max-time 15   -H 'Accept: application/vnd.github+json'   -H 'User-Agent: JobbiMusic-NAS-Updater'   "https://api.github.com/repos/b3njaram/navidrome/commits/$SHA/check-runs?per_page=100" > "$CHECKS"
if ! docker run --rm -i node:22-alpine node -e '
let data="";
process.stdin.on("data",b=>data+=b);
process.stdin.on("end",()=>{
  try{
    const json=JSON.parse(data);
    const runs=Array.isArray(json.check_runs)?json.check_runs:[];
    const passed=name=>runs.some(r=>r.name===name&&r.status==="completed"&&r.conclusion==="success"&&r.app?.slug==="github-actions");
    process.exit(passed("build")&&passed("browser-smoke")?0:1);
  }catch{process.exit(1)}
})' < "$CHECKS"; then
  log "Commit $SHA has not passed both required GitHub tests. No deployment."
  exit 0
fi
log "CI approved $SHA. Starting preview-only upgrade."
PREVIOUS_IMAGE="$(docker inspect -f '{{.Image}}' jobbi-music 2>/dev/null || true)"
IMAGE_NAME="$(docker inspect -f '{{.Config.Image}}' jobbi-music 2>/dev/null || true)"
if [ -n "$PREVIOUS_IMAGE" ] && [ -n "$IMAGE_NAME" ];then
  docker image tag "$PREVIOUS_IMAGE" "jobbi-music:previous-tested"
fi
# Fast-forward only. The .env and PostgreSQL volumes are never touched.
gitclient merge --ff-only "$SHA"
cd "$APP"
if ! docker compose -f compose.yaml config --quiet || ! docker compose -f compose.yaml up -d --build --no-deps jobbi-music;then
  log "Build/deploy failed; rolling the preview source and container back."
  gitclient reset --hard "$HEAD"
  if [ -n "$IMAGE_NAME" ] && docker image inspect jobbi-music:previous-tested >/dev/null 2>&1;then
    docker image tag jobbi-music:previous-tested "$IMAGE_NAME"
    docker compose -f compose.yaml up -d --no-build --no-deps --force-recreate jobbi-music || true
  fi
  exit 1
fi
success=0
i=0
while [ "$i" -lt 24 ];do
  if curl -fsS --max-time 3 http://127.0.0.1:3131/api/status >/dev/null;then success=1;break;fi
  sleep 3
  i=$((i+1))
done
if [ "$success" -ne 1 ];then
  log "Health check failed; rolling back preview to $HEAD."
  cd "$ROOT"
  gitclient reset --hard "$HEAD"
  cd "$APP"
  if [ -n "$IMAGE_NAME" ] && docker image inspect jobbi-music:previous-tested >/dev/null 2>&1;then
    docker image tag jobbi-music:previous-tested "$IMAGE_NAME"
    docker compose -f compose.yaml up -d --no-build --no-deps --force-recreate jobbi-music || true
  fi
  exit 1
fi
printf '%s\n' "$SHA" > "$STATE"
log "Preview updated to $SHA. /api/status is healthy."
