#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run with sudo on caudals-1." >&2
  exit 1
fi

stack="${CAUDALS_APP_STACK_NAME:-caudals-app}"
service="${stack}_app"

echo "Checking $service..."

if ! docker service inspect "$service" >/dev/null 2>&1; then
  echo "Service $service is not deployed." >&2
  exit 1
fi

container="$(docker ps --filter "label=com.docker.swarm.service.name=$service" --format '{{.ID}}' | head -n1)"
if [[ -z "$container" ]]; then
  echo "No running container found for $service." >&2
  exit 1
fi

echo "Probing container $container..."
if docker exec "$container" node -e "fetch('http://127.0.0.1:3000/').then(async r=>{if(!r.ok)throw Error(await r.text()); console.log('OK')}).catch(e=>{console.error(e);process.exit(1)})"; then
  echo "Probe successful."
  exit 0
else
  echo "Probe failed." >&2
  exit 1
fi
