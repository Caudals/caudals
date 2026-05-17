#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_VECTOR_STACK_NAME:-caudals-vector}"
NETWORK="${CAUDALS_VECTOR_NETWORK:-dokploy-network}"
QDRANT_IMAGE="${CAUDALS_QDRANT_IMAGE:-qdrant/qdrant:v1.17.1}"
QDRANT_SECRET="${CAUDALS_QDRANT_API_KEY_SECRET:-qdrant_api_key}"
QDRANT_API_KEY_FILE="${CAUDALS_QDRANT_API_KEY_FILE:-}"
GENERATED_VECTOR_DIR="${CAUDALS_GENERATED_VECTOR_DIR:-/root/.caudals/vector}"
GENERATED_QDRANT_API_KEY_FILE="$GENERATED_VECTOR_DIR/qdrant-api-key"

ensure_qdrant_api_key_file() {
  if [[ -n "$QDRANT_API_KEY_FILE" ]]; then
    if [[ ! -r "$QDRANT_API_KEY_FILE" ]]; then
      echo "Qdrant API key file is not readable: $QDRANT_API_KEY_FILE" >&2
      exit 1
    fi
    return
  fi

  mkdir -p "$GENERATED_VECTOR_DIR"
  chmod 700 "$GENERATED_VECTOR_DIR"

  if [[ ! -s "$GENERATED_QDRANT_API_KEY_FILE" ]]; then
    umask 077
    openssl rand -base64 36 >"$GENERATED_QDRANT_API_KEY_FILE"
    echo "Created root-only Qdrant API key file: $GENERATED_QDRANT_API_KEY_FILE"
  fi

  QDRANT_API_KEY_FILE="$GENERATED_QDRANT_API_KEY_FILE"
}

ensure_qdrant_secret() {
  if docker secret inspect "$QDRANT_SECRET" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$QDRANT_SECRET" "$QDRANT_API_KEY_FILE" >/dev/null
  echo "Created Qdrant Docker secret: $QDRANT_SECRET"
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the vector stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ensure_qdrant_api_key_file
ensure_qdrant_secret
pull_image "$QDRANT_IMAGE"

CAUDALS_VECTOR_NETWORK="$NETWORK" \
CAUDALS_QDRANT_IMAGE="$QDRANT_IMAGE" \
CAUDALS_QDRANT_API_KEY_SECRET="$QDRANT_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/vector/docker-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested vector stack deployment: $STACK_NAME
Internal Qdrant endpoints:
  http://caudals-vector-qdrant:6333
  grpc://caudals-vector-qdrant:6334
Run scripts/probe-vector-stack.sh to verify Qdrant readiness and private API-keyed writes.
MSG
