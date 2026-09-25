#!/usr/bin/env bash
set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo 'Run as root on the Swarm manager' >&2
  exit 1
fi
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
state_dir=/root/.caudals/evals-production
[[ -s $state_dir/evals_queue.url ]] || { echo 'Run provision-evals-production.sh first' >&2; exit 1; }
[[ -s $state_dir/org-ids.json ]] || { echo 'Create a reviewed JSON workspace allowlist in org-ids.json' >&2; exit 1; }
[[ -s $state_dir/browser-org-ids.json ]] || { echo 'Create a reviewed browser-only workspace allowlist in browser-org-ids.json' >&2; exit 1; }
for secret in caudals_evals_scheduler_database_url caudals_evals_webhook_keyring \
  caudals_evals_browser_database_url caudals_evals_browser_queue_database_url \
  caudals_evals_browser_session_keyring; do
  docker secret inspect "$secret" >/dev/null 2>&1 || { echo "Missing $secret. Run provision-evals-production.sh first" >&2; exit 1; }
done
for network in caudals-evals-browser-internal caudals-evals-browser-outbound; do
  docker network inspect "$network" >/dev/null 2>&1 || { echo "Missing $network. Run provision-evals-production.sh first" >&2; exit 1; }
done

commit=${EVALS_IMAGE_COMMIT:-$(git -C "$repo_dir" log -1 --format=%H -- \
  .github/workflows/evals-images.yml \
  infra/evals/Dockerfile infra/evals/Dockerfile.documents infra/evals/Dockerfile.browser \
  lib services/evals-worker services/evals-documents services/evals-browser \
  package.json package-lock.json tsconfig.json)}
worker_tag="mariomedpar/caudals:evals-worker-$commit"
document_tag="mariomedpar/caudals:evals-documents-$commit"
browser_tag="mariomedpar/caudals:evals-browser-$commit"
docker pull "$worker_tag" >/dev/null
docker pull "$document_tag" >/dev/null
docker pull "$browser_tag" >/dev/null
export EVALS_WORKER_IMAGE EVALS_DOCUMENT_IMAGE EVALS_BROWSER_IMAGE EVALS_WORKER_ORG_IDS EVALS_BROWSER_ORG_IDS
EVALS_WORKER_IMAGE=$(docker image inspect "$worker_tag" --format '{{index .RepoDigests 0}}')
EVALS_DOCUMENT_IMAGE=$(docker image inspect "$document_tag" --format '{{index .RepoDigests 0}}')
EVALS_BROWSER_IMAGE=$(docker image inspect "$browser_tag" --format '{{index .RepoDigests 0}}')
EVALS_WORKER_ORG_IDS=$(cat "$state_dir/org-ids.json")
EVALS_BROWSER_ORG_IDS=$(cat "$state_dir/browser-org-ids.json")
[[ $EVALS_WORKER_ORG_IDS == \[*\] ]] || { echo 'Workspace allowlist must be a JSON array' >&2; exit 1; }
[[ $EVALS_BROWSER_ORG_IDS == \[*\] ]] || { echo 'Browser allowlist must be a JSON array' >&2; exit 1; }

# pg-boss has its own database and login. Bootstrap the queue schema once, then
# run the long-lived worker with migrations disabled.
docker run --rm --network dokploy-network --user 0 \
  --mount "type=bind,src=$state_dir/evals_queue.url,dst=/run/secrets/evals_queue_database_url,readonly" \
  -e EVALS_ENV=production -e EVALS_QUEUE_SCHEMA=evals_queue_prod \
  -e EVALS_QUEUE_DATABASE_URL_FILE=/run/secrets/evals_queue_database_url \
  "$EVALS_WORKER_IMAGE" node --conditions=react-server --import tsx services/evals-worker/bootstrap-queue.ts

# Keep the browser stopped while its relay and outbound proxy change image.
# Start it only after both dependencies pass their health checks.
export EVALS_BROWSER_REPLICAS=0
docker stack deploy --with-registry-auth -c "$repo_dir/infra/evals/production-stack.yml" caudals-evals
browser_stop_deadline=$((SECONDS + 120))
while (( SECONDS < browser_stop_deadline )); do
  browser_replicas=$(docker service ls --format '{{.Name}}|{{.Replicas}}' |
    awk -F '|' '$1 == "caudals-evals_browser" { print $2 }')
  browser_container=$(docker ps -q --filter 'label=com.docker.swarm.service.name=caudals-evals_browser' | head -n 1)
  if [[ "$browser_replicas" == "0/0" && -z "$browser_container" ]]; then
    break
  fi
  sleep 2
done
if [[ "$browser_replicas" != "0/0" || -n "$browser_container" ]]; then
  echo 'Browser failed to stop before dependency rollout.' >&2
  exit 1
fi
for service in worker scheduler documents browser browser-egress; do
  name="caudals-evals_$service"
  if ! docker service inspect "$name" --format '{{json .Spec.TaskTemplate.ContainerSpec.Mounts}}' |
    jq -e 'any(.[]?; .Type == "tmpfs" and .Target == "/tmp")' >/dev/null; then
    size=67108864
    [[ $service == documents || $service == browser ]] && size=134217728
    [[ $service == browser-egress ]] && size=16777216
    # Swarm ignores Compose's tmpfs key. Its native mount keeps the read-only
    # filesystem while giving tsx and Chromium writable ephemeral scratch.
    docker service update --mount-add "type=tmpfs,destination=/tmp,tmpfs-size=$size" "$name" >/dev/null
  fi
done

wait_for_service() {
  local name="$1"
  local expected_image="$2"
  local require_healthy="${3:-false}"
  local deadline=$((SECONDS + 300))
  local actual_image="" replicas="" container_id="" health="" update_state=""

  while (( SECONDS < deadline )); do
    if actual_image=$(docker service inspect "$name" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null); then
      update_state=$(docker service inspect "$name" --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{else}}none{{end}}')
      replicas=$(docker service ls --format '{{.Name}}|{{.Replicas}}' |
        awk -F '|' -v name="$name" '$1 == name { print $2 }')
      container_id=$(docker ps -q --filter "label=com.docker.swarm.service.name=$name" | head -n 1)
      health="not-running"
      if [[ -n "$container_id" ]]; then
        health=$(docker inspect "$container_id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}')
      fi

      if [[ "$actual_image" == "$expected_image" && "$replicas" == "1/1" ]]; then
        if [[ "$require_healthy" == "true" && "$health" == "healthy" ]]; then
          echo "Verified $name on the expected image and health check."
          return 0
        elif [[ "$require_healthy" != "true" && "$health" == "running" ]]; then
          echo "Verified $name on the expected image and running."
          return 0
        fi
      fi

      if [[ "$update_state" == rollback_* && "$actual_image" != "$expected_image" ]]; then
        break
      fi
    fi
    sleep 5
  done

  echo "Evaluation service $name failed to converge (image=${actual_image:-missing}, replicas=${replicas:-missing}, health=${health:-missing}, update=${update_state:-missing})." >&2
  return 1
}

# Start the browser only after its database relay and egress gateway are healthy.
wait_for_service caudals-evals_browser-egress "$EVALS_BROWSER_IMAGE" true
wait_for_service caudals-evals_browser-db-relay "$EVALS_BROWSER_IMAGE" true
wait_for_service caudals-evals_worker "$EVALS_WORKER_IMAGE"
wait_for_service caudals-evals_scheduler "$EVALS_WORKER_IMAGE" true
wait_for_service caudals-evals_documents "$EVALS_DOCUMENT_IMAGE"
docker service scale --detach=true caudals-evals_browser=1 >/dev/null

# A browser task may fail its first start after the dependency transition.
# Retry that one worker at most twice, with the pinned image and a short pause.
for attempt in 1 2 3; do
  if wait_for_service caudals-evals_browser "$EVALS_BROWSER_IMAGE" true; then
    break
  fi
  if [[ $attempt -eq 3 ]]; then
    exit 1
  fi
  sleep 20
  echo "Retrying the browser service after its dependencies became healthy."
  docker service update --detach=true --force --image "$EVALS_BROWSER_IMAGE" caudals-evals_browser
done

echo "Deployed and verified evaluation worker images from $commit with separate general and browser workspace allowlists."
