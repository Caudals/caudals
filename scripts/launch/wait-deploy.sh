#!/usr/bin/env bash
set -euo pipefail

# Waits until production runs the images built for a commit.
# Usage: scripts/launch/wait-deploy.sh <full-sha> [app|evals|both] [timeout-seconds]
# The app image is built by deploy.yml; worker images by evals-images.yml (only
# when lib/**, services/evals-*/**, infra/evals/Dockerfile*, package*.json or
# tsconfig.json change). A newer commit's image also satisfies the wait when it
# contains <sha>.
sha="${1:?full commit sha required}"
which="${2:-app}"
timeout="${3:-3600}"
repo=/home/caudals/caudals
image_repo="${CAUDALS_APP_IMAGE_REPO:-mariomedpar/caudals}"

running_commit() {
  local service="$1" prefix="$2" digest tag
  digest="$(sudo docker service inspect "$service" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' | sed -n 's/.*@\(sha256:.*\)/\1/p')"
  [[ -n $digest ]] || return 0
  tag="$(sudo docker image ls "$image_repo" --format '{{.Tag}} {{.Digest}}' | awk -v d="$digest" -v p="$prefix" '$2==d && index($1,p)==1 {print substr($1,length(p)+1); exit}')"
  echo "$tag"
}

contains() {
  local running="$1"
  [[ -n $running ]] || return 1
  git -C "$repo" fetch -q origin main >/dev/null 2>&1 || true
  git -C "$repo" merge-base --is-ancestor "$sha" "$running" 2>/dev/null
}

deadline=$(( $(date +%s) + timeout ))
while :; do
  ok=true
  if [[ $which == app || $which == both ]]; then
    app="$(running_commit caudals-app_app '')"
    contains "$app" || ok=false
  fi
  if [[ $which == evals || $which == both ]]; then
    worker="$(running_commit caudals-evals_worker 'evals-worker-')"
    contains "$worker" || ok=false
  fi
  if $ok; then
    echo "Deployed: app=${app:-n/a} worker=${worker:-n/a}"
    exit 0
  fi
  if (( $(date +%s) > deadline )); then
    echo "Timed out waiting for $sha (app=${app:-?} worker=${worker:-?})" >&2
    exit 1
  fi
  sleep 30
done
