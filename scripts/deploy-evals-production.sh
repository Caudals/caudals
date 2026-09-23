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
  "$EVALS_WORKER_IMAGE" node --conditions=react-server --import tsx -e \
  "import('./lib/evals/queue/boss.ts').then(async m=>{const b=m.createBoss(process.env,{bootstrap:true});try{await m.startBoss(b)}finally{await b.stop({graceful:true})}})"

docker stack deploy --with-registry-auth -c "$repo_dir/infra/evals/production-stack.yml" caudals-evals
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
echo "Deployed evaluation worker images from $commit with separate general and browser workspace allowlists."
