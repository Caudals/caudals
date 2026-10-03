#!/usr/bin/env bash
set -euo pipefail
container_id=$(docker ps -q --filter label=com.docker.swarm.service.name=caudals-warmbly_backend)
[[ -n "$container_id" && "$container_id" != *$'\n'* ]] || { echo 'Expected one Warmbly backend' >&2; exit 1; }
# docker exec does not inherit values sourced by PID 1 at startup.
docker exec -i "$container_id" sh -c 'set -a; . /run/secrets/runtime_env; set +a; exec warmblyctl "$@"' warmblyctl "$@"
