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

commit=$(git -C "$repo_dir" rev-parse HEAD)
worker_tag="mariomedpar/caudals:evals-worker-$commit"
document_tag="mariomedpar/caudals:evals-documents-$commit"
docker pull "$worker_tag" >/dev/null
docker pull "$document_tag" >/dev/null
export EVALS_WORKER_IMAGE EVALS_DOCUMENT_IMAGE EVALS_WORKER_ORG_IDS
EVALS_WORKER_IMAGE=$(docker image inspect "$worker_tag" --format '{{index .RepoDigests 0}}')
EVALS_DOCUMENT_IMAGE=$(docker image inspect "$document_tag" --format '{{index .RepoDigests 0}}')
EVALS_WORKER_ORG_IDS=$(cat "$state_dir/org-ids.json")
[[ $EVALS_WORKER_ORG_IDS == \[*\] ]] || { echo 'Workspace allowlist must be a JSON array' >&2; exit 1; }

# pg-boss has its own database and login. Bootstrap the queue schema once, then
# run the long-lived worker with migrations disabled.
docker run --rm --network dokploy-network --user 0 \
  --mount "type=bind,src=$state_dir/evals_queue.url,dst=/run/secrets/evals_queue_database_url,readonly" \
  -e EVALS_ENV=production -e EVALS_QUEUE_SCHEMA=evals_queue_prod \
  -e EVALS_QUEUE_DATABASE_URL_FILE=/run/secrets/evals_queue_database_url \
  "$EVALS_WORKER_IMAGE" node --conditions=react-server --import tsx -e \
  "import('./lib/evals/queue/boss.ts').then(async m=>{const b=m.createBoss(process.env,{bootstrap:true});try{await m.startBoss(b)}finally{await b.stop({graceful:true})}})"

docker stack deploy --with-registry-auth -c "$repo_dir/infra/evals/production-stack.yml" caudals-evals
echo "Deployed evaluation worker images from $commit with an explicit workspace allowlist."
