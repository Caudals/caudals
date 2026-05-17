#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_CVAT_STACK_NAME:-caudals-cvat}"
NETWORK="${CAUDALS_LABELING_NETWORK:-dokploy-network}"
SERVER_IMAGE="${CAUDALS_CVAT_SERVER_IMAGE:-cvat/server:v2.64.0}"
UI_IMAGE="${CAUDALS_CVAT_UI_IMAGE:-cvat/ui:v2.64.0}"
POSTGRES_IMAGE="${CAUDALS_CVAT_POSTGRES_IMAGE:-postgres:15-alpine}"
REDIS_IMAGE="${CAUDALS_CVAT_REDIS_IMAGE:-redis:7.2.11-alpine}"
KVROCKS_IMAGE="${CAUDALS_CVAT_KVROCKS_IMAGE:-apache/kvrocks:2.15.0}"
CLICKHOUSE_IMAGE="${CAUDALS_CVAT_CLICKHOUSE_IMAGE:-clickhouse/clickhouse-server:23.11-alpine}"
OPA_IMAGE="${CAUDALS_CVAT_OPA_IMAGE:-openpolicyagent/opa:1.12.2}"
POSTGRES_PASSWORD_SECRET="${CAUDALS_CVAT_POSTGRES_PASSWORD_SECRET:-caudals_cvat_postgres_password}"
POSTGRES_PASSWORD_FILE="${CAUDALS_CVAT_POSTGRES_PASSWORD_FILE:-}"
GENERATED_LABELING_DIR="${CAUDALS_GENERATED_LABELING_DIR:-/root/.caudals/labeling}"
GENERATED_POSTGRES_PASSWORD_FILE="$GENERATED_LABELING_DIR/cvat-postgres-password"

ensure_secret_file() {
  local source_file="$1"
  local generated_file="$2"
  local label="$3"

  if [[ -n "$source_file" ]]; then
    if [[ ! -r "$source_file" ]]; then
      echo "$label file is not readable: $source_file" >&2
      exit 1
    fi
    printf "%s" "$source_file"
    return
  fi

  mkdir -p "$GENERATED_LABELING_DIR"
  chmod 700 "$GENERATED_LABELING_DIR"

  if [[ ! -s "$generated_file" ]]; then
    umask 077
    openssl rand -base64 48 >"$generated_file"
    echo "Created root-only $label file: $generated_file" >&2
  fi

  printf "%s" "$generated_file"
}

ensure_docker_secret() {
  local secret_name="$1"
  local secret_file="$2"
  local label="$3"

  if docker secret inspect "$secret_name" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$secret_name" "$secret_file" >/dev/null
  echo "Created $label Docker secret: $secret_name"
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the CVAT stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

POSTGRES_PASSWORD_FILE="$(
  ensure_secret_file \
    "$POSTGRES_PASSWORD_FILE" \
    "$GENERATED_POSTGRES_PASSWORD_FILE" \
    "CVAT PostgreSQL password"
)"

ensure_docker_secret \
  "$POSTGRES_PASSWORD_SECRET" \
  "$POSTGRES_PASSWORD_FILE" \
  "CVAT PostgreSQL password"

pull_image "$SERVER_IMAGE"
pull_image "$UI_IMAGE"
pull_image "$POSTGRES_IMAGE"
pull_image "$REDIS_IMAGE"
pull_image "$KVROCKS_IMAGE"
pull_image "$CLICKHOUSE_IMAGE"
pull_image "$OPA_IMAGE"

CAUDALS_LABELING_NETWORK="$NETWORK" \
CAUDALS_CVAT_SERVER_IMAGE="$SERVER_IMAGE" \
CAUDALS_CVAT_UI_IMAGE="$UI_IMAGE" \
CAUDALS_CVAT_POSTGRES_IMAGE="$POSTGRES_IMAGE" \
CAUDALS_CVAT_REDIS_IMAGE="$REDIS_IMAGE" \
CAUDALS_CVAT_KVROCKS_IMAGE="$KVROCKS_IMAGE" \
CAUDALS_CVAT_CLICKHOUSE_IMAGE="$CLICKHOUSE_IMAGE" \
CAUDALS_CVAT_OPA_IMAGE="$OPA_IMAGE" \
CAUDALS_CVAT_POSTGRES_PASSWORD_SECRET="$POSTGRES_PASSWORD_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/labeling/cvat-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested private CVAT stack deployment: $STACK_NAME
Internal CVAT endpoints:
  http://caudals-labeling-cvat-server:8080/api/server/about
  http://caudals-labeling-cvat-ui:8000
Run scripts/probe-cvat-stack.sh to verify image/video annotation readiness.
MSG
