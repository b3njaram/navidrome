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
if [ -n "$(docker ps -q --filter 'name=^/jobbi-invidious-worker
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
if [ "$WORKER_UPDATE" = 1 ];then
  # A just-recreated Docker container may take a few seconds to become ready.
  # Do not roll back a healthy worker because the first probe raced startup.
  WORKER_READY=0
  i=0
  while [ "$i" -lt 20 ];do
    if docker exec jobbi-invidious-worker python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5).read()" >/dev/null 2>&1;then
      WORKER_READY=1
      break
    fi
    sleep 3
    i=$((i+1))
  done
  if [ "$WORKER_READY" -ne 1 ];then
    log "Invidious worker health check failed after 20 attempts. Capturing diagnostic logs before rollback."
    docker inspect -f 'Worker status={{.State.Status}} exit={{.State.ExitCode}} restarts={{.RestartCount}}' jobbi-invidious-worker 2>&1 | tee -a "$LOG" || true
    docker logs --tail 50 jobbi-invidious-worker 2>&1 | tee -a "$LOG" || true
    log "Worker startup failed. Check WORKER_SECRET length (>=32), import-folder permissions, and worker logs above."
    rollback_release
    exit 1
  fi
  # Check the real application-to-worker route, not merely its localhost port.
  # This also detects an outdated worker image (404) or a secret mismatch (403).
  if WORKER_PROBE="$(docker exec jobbi-music node -e '
const url=process.env.INVIDIOUS_WORKER_URL;
const token=process.env.INVIDIOUS_WORKER_SECRET;
if(url!=="http://jobbi-invidious-worker:8091"||!token||token.length<32){
  console.error("Worker URL/token not configured in Jobbi Music");process.exit(1);
}
fetch(url+"/inspect",{
  method:"POST",
  headers:{"X-Worker-Token":token,"Content-Type":"application/json"},
  body:JSON.stringify({owner:"user-healthcheck",videoIds:[]}),
  signal:AbortSignal.timeout(15000)
}).then(async response=>{
  if(!response.ok)throw Error("Worker /inspect returned HTTP "+response.status);
  const body=await response.json();
  if(!Array.isArray(body.items))throw Error("Unexpected inspector response");
  console.log("Invidious worker reachable and authenticated from Jobbi Music");
}).catch(error=>{console.error(error.message);process.exit(1)});
' 2>&1)";then
    log "$WORKER_PROBE"
  else
    log "Website-to-worker inspection failed: $WORKER_PROBE"
    log "Check the app/worker URL, worker token and Docker networking before retry."
    rollback_release
    exit 1
  fi
fi
printf '%s\n' "$SHA" > "$STATE"
log "Preview updated to $SHA. /api/status is healthy."
 2>/dev/null)" ] &&
   [ -n "$(gitclient diff --name-only "$HEAD" "$SHA" -- jobbi-music/invidious-worker)" ];then
  WORKER_UPDATE=1
  # The optional worker is not healthy with an empty secret. Validate the
  # NAS-only configuration before building or restarting any services.
  if [ ! -f "$APP/.env" ] ||
     ! grep -qx 'INVIDIOUS_WORKER_URL=http://jobbi-invidious-worker:8091' "$APP/.env" ||
     ! awk 'index($0,"INVIDIOUS_WORKER_SECRET=")==1 {
       secret=substr($0,index($0,"=")+1)
       if(length(secret)>=32) found=1
     } END {exit(found?0:1)}' "$APP/.env";then
    log "Invidious worker is configured incompletely on the NAS. No services changed."
    log "Inspect .env values without printing secrets, then enable the worker locally."
    exit 1
  fi
  # Prevent an update from interrupting audio actively queued or downloading.
  # Do not silently discard worker jobs; retry when the running queue drains.
  BUSY_JOBS="$(docker exec jobbi-invidious-worker python -c '
import json
from pathlib import Path
path=Path("/imports/.jobbi-state/jobs.json")
rows=json.loads(path.read_text()) if path.is_file() else []
print(sum(j.get("status") in ("running","queued") for j in rows))
' 2>/dev/null || echo unknown)"
  if [ "$BUSY_JOBS" != '0' ];then
    log "Worker currently has $BUSY_JOBS active/queued jobs (or could not be inspected). Skipping update to avoid interrupting transfers."
    exit 0
  fi
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
if [ "$WORKER_UPDATE" = 1 ];then
  # A just-recreated Docker container may take a few seconds to become ready.
  # Do not roll back a healthy worker because the first probe raced startup.
  WORKER_READY=0
  i=0
  while [ "$i" -lt 20 ];do
    if docker exec jobbi-invidious-worker python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5).read()" >/dev/null 2>&1;then
      WORKER_READY=1
      break
    fi
    sleep 3
    i=$((i+1))
  done
  if [ "$WORKER_READY" -ne 1 ];then
    log "Invidious worker health check failed after 20 attempts. Capturing diagnostic logs before rollback."
    docker inspect -f 'Worker status={{.State.Status}} exit={{.State.ExitCode}} restarts={{.RestartCount}}' jobbi-invidious-worker 2>&1 | tee -a "$LOG" || true
    docker logs --tail 50 jobbi-invidious-worker 2>&1 | tee -a "$LOG" || true
    log "Worker startup failed. Check WORKER_SECRET length (>=32), import-folder permissions, and worker logs above."
    rollback_release
    exit 1
  fi
  # Check the real application-to-worker route, not merely its localhost port.
  # This also detects an outdated worker image (404) or a secret mismatch (403).
  if WORKER_PROBE="$(docker exec jobbi-music node -e '
const url=process.env.INVIDIOUS_WORKER_URL;
const token=process.env.INVIDIOUS_WORKER_SECRET;
if(url!=="http://jobbi-invidious-worker:8091"||!token||token.length<32){
  console.error("Worker URL/token not configured in Jobbi Music");process.exit(1);
}
fetch(url+"/inspect",{
  method:"POST",
  headers:{"X-Worker-Token":token,"Content-Type":"application/json"},
  body:JSON.stringify({owner:"user-healthcheck",videoIds:[]}),
  signal:AbortSignal.timeout(15000)
}).then(async response=>{
  if(!response.ok)throw Error("Worker /inspect returned HTTP "+response.status);
  const body=await response.json();
  if(!Array.isArray(body.items))throw Error("Unexpected inspector response");
  console.log("Invidious worker reachable and authenticated from Jobbi Music");
}).catch(error=>{console.error(error.message);process.exit(1)});
' 2>&1)";then
    log "$WORKER_PROBE"
  else
    log "Website-to-worker inspection failed: $WORKER_PROBE"
    log "Check the app/worker URL, worker token and Docker networking before retry."
    rollback_release
    exit 1
  fi
fi
printf '%s\n' "$SHA" > "$STATE"
log "Preview updated to $SHA. /api/status is healthy."
