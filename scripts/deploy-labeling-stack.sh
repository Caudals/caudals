#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_LABELING_STACK_NAME:-caudals-labeling}"
NETWORK="${CAUDALS_LABELING_NETWORK:-dokploy-network}"
LABEL_STUDIO_IMAGE="${CAUDALS_LABEL_STUDIO_IMAGE:-heartexlabs/label-studio:1.21.0}"
POSTGRES_IMAGE="${CAUDALS_LABEL_STUDIO_POSTGRES_IMAGE:-postgres:16-alpine}"
POSTGRES_SECRET="${CAUDALS_LABEL_STUDIO_POSTGRES_SECRET:-label_studio_postgres_password}"
SECRET_KEY_SECRET="${CAUDALS_LABEL_STUDIO_SECRET_KEY_SECRET:-label_studio_secret_key}"
POSTGRES_PASSWORD_FILE="${CAUDALS_LABEL_STUDIO_POSTGRES_PASSWORD_FILE:-}"
SECRET_KEY_FILE="${CAUDALS_LABEL_STUDIO_SECRET_KEY_FILE:-}"
GENERATED_LABELING_DIR="${CAUDALS_GENERATED_LABELING_DIR:-/root/.caudals/labeling}"
GENERATED_POSTGRES_PASSWORD_FILE="$GENERATED_LABELING_DIR/label-studio-postgres-password"
GENERATED_SECRET_KEY_FILE="$GENERATED_LABELING_DIR/label-studio-secret-key"

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
  echo "Docker Swarm manager access is required before deploying the labeling stack." >&2
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
    "Label Studio PostgreSQL password"
)"
SECRET_KEY_FILE="$(
  ensure_secret_file \
    "$SECRET_KEY_FILE" \
    "$GENERATED_SECRET_KEY_FILE" \
    "Label Studio Django secret key"
)"

ensure_docker_secret \
  "$POSTGRES_SECRET" \
  "$POSTGRES_PASSWORD_FILE" \
  "Label Studio PostgreSQL password"
ensure_docker_secret \
  "$SECRET_KEY_SECRET" \
  "$SECRET_KEY_FILE" \
  "Label Studio Django secret key"

pull_image "$POSTGRES_IMAGE"
pull_image "$LABEL_STUDIO_IMAGE"

CAUDALS_LABELING_NETWORK="$NETWORK" \
CAUDALS_LABEL_STUDIO_IMAGE="$LABEL_STUDIO_IMAGE" \
CAUDALS_LABEL_STUDIO_POSTGRES_IMAGE="$POSTGRES_IMAGE" \
CAUDALS_LABEL_STUDIO_POSTGRES_SECRET="$POSTGRES_SECRET" \
CAUDALS_LABEL_STUDIO_SECRET_KEY_SECRET="$SECRET_KEY_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/labeling/docker-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested labeling stack deployment: $STACK_NAME
Internal Label Studio endpoint:
  http://caudals-labeling-label-studio:8080
Internal PostgreSQL endpoint:
  postgres://labelstudio@caudals-labeling-postgres:5432/labelstudio
Run scripts/probe-labeling-stack.sh to verify private Label Studio readiness.
MSG
