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
# An older scheduled updater may have pulled the new frontend before this
# script knew how to update the separate Invidious image. On the next run,
# reconcile a stale running worker even when GitHub HEAD has not changed.
if [ "$SHA" = "$HEAD" ];then
  if [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$SHA" ] &&
     [ -n "$(docker ps -q --filter 'name=^/jobbi-invidious-worker
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
log "CI approved $SHA. Deploying Jobbi Music production update."
PREVIOUS_IMAGE="$(docker inspect -f '{{.Image}}' jobbi-music 2>/dev/null || true)"
IMAGE_NAME="$(docker inspect -f '{{.Config.Image}}' jobbi-music 2>/dev/null || true)"
if [ -n "$PREVIOUS_IMAGE" ] && [ -n "$IMAGE_NAME" ];then
  docker image tag "$PREVIOUS_IMAGE" "jobbi-music:previous-tested"
fi

# Rebuild the optional worker ONLY when its sources changed AND the user had
# already enabled it. Do not start an opt-in service or interrupt its queue on
# unrelated website changes.
WORKER_UPDATE=0
WORKER_PREVIOUS_IMAGE=""
WORKER_IMAGE_NAME=""
if [ -n "$(docker ps -q --filter 'name=^/jobbi-invidious-worker$' 2>/dev/null)" ] &&
   [ -n "$(gitclient diff --name-only "$HEAD" "$SHA" -- jobbi-music/invidious-worker)" ];then
  WORKER_UPDATE=1
  WORKER_PREVIOUS_IMAGE="$(docker inspect -f '{{.Image}}' jobbi-invidious-worker 2>/dev/null || true)"
  WORKER_IMAGE_NAME="$(docker inspect -f '{{.Config.Image}}' jobbi-invidious-worker 2>/dev/null || true)"
  if [ -n "$WORKER_PREVIOUS_IMAGE" ] && [ -n "$WORKER_IMAGE_NAME" ];then
    docker image tag "$WORKER_PREVIOUS_IMAGE" "jobbi-invidious-worker:previous-tested"
  fi
fi
rollback_release(){
  log "Restoring the previously tested Jobbi Music release."
  cd "$ROOT"
  gitclient reset --hard "$HEAD"
  cd "$APP"
  if [ -n "$IMAGE_NAME" ] && docker image inspect jobbi-music:previous-tested >/dev/null 2>&1;then
    docker image tag jobbi-music:previous-tested "$IMAGE_NAME"
    docker compose -f compose.yaml up -d --no-build --no-deps --force-recreate jobbi-music || true
  fi
  if [ "$WORKER_UPDATE" = 1 ] && [ -n "$WORKER_IMAGE_NAME" ] &&
     docker image inspect jobbi-invidious-worker:previous-tested >/dev/null 2>&1;then
    docker image tag jobbi-invidious-worker:previous-tested "$WORKER_IMAGE_NAME"
    docker compose -f compose.yaml --profile invidious-import up -d --no-build --no-deps --force-recreate jobbi-invidious-worker || true
  fi
}
gitclient merge --ff-only "$SHA"
cd "$APP"
if ! docker compose -f compose.yaml config --quiet ||
   ! docker compose -f compose.yaml up -d --build --no-deps jobbi-music;then
  log "Jobbi Music build/deploy failed."
  rollback_release
  exit 1
fi
if [ "$WORKER_UPDATE" = 1 ];then
  log "Invidious worker source changed. Updating already-enabled private worker."
  if ! docker compose -f compose.yaml --profile invidious-import up -d --build --no-deps jobbi-invidious-worker;then
    log "Invidious worker build/deploy failed."
    rollback_release
    exit 1
  fi
fi
success=0
i=0
while [ "$i" -lt 24 ];do
  if curl -fsS --max-time 3 http://127.0.0.1:3131/api/status >/dev/null;then success=1;break;fi
  sleep 3
  i=$((i+1))
done
if [ "$success" -ne 1 ];then
  log "Jobbi Music health check failed."
  rollback_release
  exit 1
fi
if [ "$WORKER_UPDATE" = 1 ] &&
   ! docker exec jobbi-invidious-worker python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5).read()" >/dev/null 2>&1;then
  log "Invidious worker health check failed."
  rollback_release
  exit 1
fi
printf '%s\n' "$SHA" > "$STATE"
log "Preview updated to $SHA. /api/status is healthy."
 2>/dev/null)" ];then
    SOURCE_SUM="$(sha256sum "$APP/invidious-worker/app.py" 2>/dev/null | awk '{print $1}')"
    RUNNING_SUM="$(docker exec jobbi-invidious-worker sha256sum /worker/app.py 2>/dev/null | awk '{print $1}')"
    if [ -n "$SOURCE_SUM" ] && [ "$SOURCE_SUM" != "$RUNNING_SUM" ];then
      log "Frontend is current but Invidious worker code is stale; rebuilding the enabled worker."
      cd "$APP"
      OLD_WORKER_IMAGE="$(docker inspect -f '{{.Image}}' jobbi-invidious-worker 2>/dev/null || true)"
      OLD_WORKER_NAME="$(docker inspect -f '{{.Config.Image}}' jobbi-invidious-worker 2>/dev/null || true)"
      if [ -n "$OLD_WORKER_IMAGE" ] && [ -n "$OLD_WORKER_NAME" ];then
        docker image tag "$OLD_WORKER_IMAGE" jobbi-invidious-worker:previous-tested
      fi
      if ! docker compose -f compose.yaml --profile invidious-import up -d --build --no-deps jobbi-invidious-worker ||
         ! docker exec jobbi-invidious-worker python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5).read()" >/dev/null 2>&1;then
        log "Worker refresh failed; restoring its previous image."
        if [ -n "$OLD_WORKER_NAME" ] && docker image inspect jobbi-invidious-worker:previous-tested >/dev/null 2>&1;then
          docker image tag jobbi-invidious-worker:previous-tested "$OLD_WORKER_NAME"
          docker compose -f compose.yaml --profile invidious-import up -d --no-build --no-deps --force-recreate jobbi-invidious-worker || true
        fi
        exit 1
      fi
      log "Enabled Invidious worker refreshed and healthy."
    fi
  fi
  exit 0
fi
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
log "CI approved $SHA. Deploying Jobbi Music production update."
PREVIOUS_IMAGE="$(docker inspect -f '{{.Image}}' jobbi-music 2>/dev/null || true)"
IMAGE_NAME="$(docker inspect -f '{{.Config.Image}}' jobbi-music 2>/dev/null || true)"
if [ -n "$PREVIOUS_IMAGE" ] && [ -n "$IMAGE_NAME" ];then
  docker image tag "$PREVIOUS_IMAGE" "jobbi-music:previous-tested"
fi

# Rebuild the optional worker ONLY when its sources changed AND the user had
# already enabled it. Do not start an opt-in service or interrupt its queue on
# unrelated website changes.
WORKER_UPDATE=0
WORKER_PREVIOUS_IMAGE=""
WORKER_IMAGE_NAME=""
if [ -n "$(docker ps -q --filter 'name=^/jobbi-invidious-worker$' 2>/dev/null)" ] &&
   [ -n "$(gitclient diff --name-only "$HEAD" "$SHA" -- jobbi-music/invidious-worker)" ];then
  WORKER_UPDATE=1
  WORKER_PREVIOUS_IMAGE="$(docker inspect -f '{{.Image}}' jobbi-invidious-worker 2>/dev/null || true)"
  WORKER_IMAGE_NAME="$(docker inspect -f '{{.Config.Image}}' jobbi-invidious-worker 2>/dev/null || true)"
  if [ -n "$WORKER_PREVIOUS_IMAGE" ] && [ -n "$WORKER_IMAGE_NAME" ];then
    docker image tag "$WORKER_PREVIOUS_IMAGE" "jobbi-invidious-worker:previous-tested"
  fi
fi
rollback_release(){
  log "Restoring the previously tested Jobbi Music release."
  cd "$ROOT"
  gitclient reset --hard "$HEAD"
  cd "$APP"
  if [ -n "$IMAGE_NAME" ] && docker image inspect jobbi-music:previous-tested >/dev/null 2>&1;then
    docker image tag jobbi-music:previous-tested "$IMAGE_NAME"
    docker compose -f compose.yaml up -d --no-build --no-deps --force-recreate jobbi-music || true
  fi
  if [ "$WORKER_UPDATE" = 1 ] && [ -n "$WORKER_IMAGE_NAME" ] &&
     docker image inspect jobbi-invidious-worker:previous-tested >/dev/null 2>&1;then
    docker image tag jobbi-invidious-worker:previous-tested "$WORKER_IMAGE_NAME"
    docker compose -f compose.yaml --profile invidious-import up -d --no-build --no-deps --force-recreate jobbi-invidious-worker || true
  fi
}
gitclient merge --ff-only "$SHA"
cd "$APP"
if ! docker compose -f compose.yaml config --quiet ||
   ! docker compose -f compose.yaml up -d --build --no-deps jobbi-music;then
  log "Jobbi Music build/deploy failed."
  rollback_release
  exit 1
fi
if [ "$WORKER_UPDATE" = 1 ];then
  log "Invidious worker source changed. Updating already-enabled private worker."
  if ! docker compose -f compose.yaml --profile invidious-import up -d --build --no-deps jobbi-invidious-worker;then
    log "Invidious worker build/deploy failed."
    rollback_release
    exit 1
  fi
fi
success=0
i=0
while [ "$i" -lt 24 ];do
  if curl -fsS --max-time 3 http://127.0.0.1:3131/api/status >/dev/null;then success=1;break;fi
  sleep 3
  i=$((i+1))
done
if [ "$success" -ne 1 ];then
  log "Jobbi Music health check failed."
  rollback_release
  exit 1
fi
if [ "$WORKER_UPDATE" = 1 ] &&
   ! docker exec jobbi-invidious-worker python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5).read()" >/dev/null 2>&1;then
  log "Invidious worker health check failed."
  rollback_release
  exit 1
fi
printf '%s\n' "$SHA" > "$STATE"
log "Preview updated to $SHA. /api/status is healthy."
