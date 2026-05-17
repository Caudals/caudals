#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_CACHE_STACK_NAME:-caudals-cache}"
NETWORK="${CAUDALS_CACHE_NETWORK:-dokploy-network}"
REDIS_IMAGE="${CAUDALS_REDIS_IMAGE:-redis:7.4.2-alpine}"
REDIS_SECRET="${CAUDALS_REDIS_PASSWORD_SECRET:-redis_password}"
REDIS_PASSWORD_FILE="${CAUDALS_REDIS_PASSWORD_FILE:-}"
GENERATED_CACHE_DIR="${CAUDALS_GENERATED_CACHE_DIR:-/root/.caudals/cache}"
GENERATED_REDIS_PASSWORD_FILE="$GENERATED_CACHE_DIR/redis-password"

ensure_redis_password_file() {
  if [[ -n "$REDIS_PASSWORD_FILE" ]]; then
    if [[ ! -r "$REDIS_PASSWORD_FILE" ]]; then
      echo "Redis password file is not readable: $REDIS_PASSWORD_FILE" >&2
      exit 1
    fi
    return
  fi

  mkdir -p "$GENERATED_CACHE_DIR"
  chmod 700 "$GENERATED_CACHE_DIR"

  if [[ ! -s "$GENERATED_REDIS_PASSWORD_FILE" ]]; then
    umask 077
    openssl rand -base64 36 >"$GENERATED_REDIS_PASSWORD_FILE"
    echo "Created root-only Redis password file: $GENERATED_REDIS_PASSWORD_FILE"
  fi

  REDIS_PASSWORD_FILE="$GENERATED_REDIS_PASSWORD_FILE"
}

ensure_redis_secret() {
  if docker secret inspect "$REDIS_SECRET" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$REDIS_SECRET" "$REDIS_PASSWORD_FILE" >/dev/null
  echo "Created Redis Docker secret: $REDIS_SECRET"
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the cache stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ensure_redis_password_file
ensure_redis_secret
pull_image "$REDIS_IMAGE"

CAUDALS_CACHE_NETWORK="$NETWORK" \
CAUDALS_REDIS_IMAGE="$REDIS_IMAGE" \
CAUDALS_REDIS_PASSWORD_SECRET="$REDIS_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/cache/docker-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested cache stack deployment: $STACK_NAME
Internal Redis endpoint:
  redis://caudals-cache-redis:6379
Run scripts/probe-cache-stack.sh to verify authenticated Redis queue/cache readiness.
MSG
