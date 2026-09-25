#!/usr/bin/env bash
set -euo pipefail

# Periodic Docker garbage collection for caudals-1, run by
# caudals-docker-cleanup.timer (infra/host). Every deploy leaves a new image
# tag behind (0.9-2.2 GB of unique layers each), so this removes only what no
# Swarm service, container or in-flight deploy can still need:
#
# - stopped Swarm task containers finished over an hour ago (Swarm keeps
#   several per service despite task-history-limit 1, and each pins an old
#   image), and other stopped containers older than a day,
# - images that are not the current or rollback (PreviousSpec) image of any
#   service, not used by any container, and not built or pulled recently,
# - build cache older than a day,
# - anonymous volumes no container uses,
# - journal beyond a size cap and old crash dumps.
#
# Installed by scripts/install-host-docker-cleanup.sh. Preview with
# CAUDALS_CLEANUP_DRY_RUN=true.

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run with sudo on caudals-1." >&2
  exit 1
fi

min_image_age_hours="${CAUDALS_CLEANUP_MIN_IMAGE_AGE_HOURS:-2}"
swarm_task_age_hours="${CAUDALS_CLEANUP_SWARM_TASK_AGE_HOURS:-1}"
container_age_hours="${CAUDALS_CLEANUP_CONTAINER_AGE_HOURS:-24}"
build_cache_age_hours="${CAUDALS_CLEANUP_BUILD_CACHE_AGE_HOURS:-24}"
coredump_age_days="${CAUDALS_CLEANUP_COREDUMP_AGE_DAYS:-7}"
journal_max_size="${CAUDALS_CLEANUP_JOURNAL_MAX_SIZE:-200M}"
pressure_percent="${CAUDALS_CLEANUP_PRESSURE_PERCENT:-90}"
warn_percent="${CAUDALS_CLEANUP_WARN_PERCENT:-85}"
# Images built on the host that no registry can give back.
keep_repositories="${CAUDALS_CLEANUP_KEEP_REPOSITORIES:-caudals-postgres}"
dry_run="${CAUDALS_CLEANUP_DRY_RUN:-false}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
disk_percent() { df --output=pcent / | tail -1 | tr -dc '0-9'; }
to_epoch() { date -u -d "$1" +%s 2>/dev/null || echo 0; }

run() {
  if [[ $dry_run == true ]]; then
    log "dry-run: $*"
  else
    "$@"
  fi
}

start_percent="$(disk_percent)"
log "start: / is ${start_percent}% used"
if ((start_percent >= pressure_percent)); then
  log "disk pressure (>= ${pressure_percent}%): 1h image age, all unused build cache"
  min_image_age_hours=1
  build_cache_age_hours=0
fi

# Finished Swarm task containers. Swarm never needs them to roll back (it
# starts a new task from PreviousSpec), and each one pins its image.
now="$(date -u +%s)"
swarm_tasks="$(docker ps -aq --filter label=com.docker.swarm.task.id --filter status=exited --filter status=dead)"
while IFS= read -r container; do
  [[ -n $container ]] || continue
  read -r name finished < <(docker inspect --format '{{.Name}} {{.State.FinishedAt}}' "$container" 2>/dev/null) || continue
  (((now - $(to_epoch "$finished")) >= swarm_task_age_hours * 3600)) || continue
  if [[ $dry_run == true ]]; then
    log "dry-run: docker rm ${name#/}"
  elif docker rm "$container" >/dev/null 2>&1; then
    log "removed stopped task ${name#/}"
  fi
done <<<"$swarm_tasks"

# Any other stopped container (one-off runs, compose leftovers).
run docker container prune -f --filter "until=${container_age_hours}h"

# Everything a service runs or would roll back to, and everything a remaining
# container uses, is protected. Both lookups fail closed: if either errors,
# set -e stops the script before any image is touched.
service_refs="$(
  docker service ls -q | xargs -r docker service inspect --format \
    '{{.Spec.TaskTemplate.ContainerSpec.Image}}{{"\n"}}{{with .PreviousSpec}}{{.TaskTemplate.ContainerSpec.Image}}{{end}}'
)"
container_images="$(docker ps -aq | xargs -r docker inspect --format '{{.Image}}')"

declare -A protected=()
while IFS= read -r ref; do
  [[ -n $ref ]] || continue
  if [[ $ref == *@sha256:* ]]; then
    protected["sha256:${ref##*@sha256:}"]=1
  fi
  if id="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null)"; then
    protected["$id"]=1
  fi
done <<<"$service_refs"
while IFS= read -r id; do
  [[ -n $id ]] && protected["$id"]=1
done <<<"$container_images"
log "protected images: ${#protected[@]}"

min_age_seconds=$((min_image_age_hours * 3600))
removed=0
refused=0
images="$(docker image ls --no-trunc --format '{{.ID}}|{{.Repository}}|{{.Tag}}')"
while IFS='|' read -r id repository tag; do
  [[ -n $id ]] || continue
  [[ -z ${protected[$id]:-} ]] || continue
  [[ " $keep_repositories " != *" $repository "* ]] || continue

  # LastTagTime moves on pull and tag, so an old image a deploy has just pulled
  # counts as fresh until Swarm references it.
  read -r created last_tagged < <(docker image inspect --format '{{.Created}} {{.Metadata.LastTagTime}}' "$id" 2>/dev/null) || continue
  newest="$(to_epoch "$created")"
  tagged="$(to_epoch "$last_tagged")"
  ((tagged > newest)) && newest="$tagged"
  ((now - newest >= min_age_seconds)) || continue

  if [[ $repository == "<none>" || $tag == "<none>" ]]; then
    target="$id"
  else
    target="$repository:$tag"
  fi
  if [[ $dry_run == true ]]; then
    log "dry-run: docker image rm $target"
    removed=$((removed + 1))
  elif output="$(docker image rm "$target" 2>&1)"; then
    log "removed image $target"
    removed=$((removed + 1))
  else
    log "kept image $target: ${output##*$'\n'}"
    refused=$((refused + 1))
  fi
done <<<"$images"
log "images removed: $removed, refused by docker: $refused"

if ((build_cache_age_hours == 0)); then
  run docker builder prune -af
else
  run docker builder prune -af --filter "until=${build_cache_age_hours}h"
fi

# Without --all this removes anonymous volumes only; named volumes (databases,
# MinIO, Postiz) are never touched.
run docker volume prune -f

run journalctl --vacuum-size="$journal_max_size" --quiet
if [[ -d /var/lib/apport/coredump ]]; then
  run find /var/lib/apport/coredump -type f -mtime "+$coredump_age_days" -delete
fi

end_percent="$(disk_percent)"
log "end: / is ${end_percent}% used (was ${start_percent}%)"
docker system df

if ((end_percent >= warn_percent)); then
  log "WARNING: / is still ${end_percent}% used after cleanup; what remains is in use" >&2
  exit 2
fi
