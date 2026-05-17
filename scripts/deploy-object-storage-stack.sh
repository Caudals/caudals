#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_OBJECT_STORAGE_STACK_NAME:-caudals-object-storage}"
NETWORK="${CAUDALS_OBJECT_STORAGE_NETWORK:-dokploy-network}"
APP_SERVICE="${CAUDALS_APP_SERVICE:-caudalsdep-caudals-vgbvxp}"
MINIO_IMAGE="${CAUDALS_MINIO_IMAGE:-quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1}"
MINIO_API_URL="${CAUDALS_MINIO_API_URL:-http://caudals-object-storage-minio:9000}"
BUCKET="${CAUDALS_OBJECT_STORAGE_BUCKET:-caudals-storage}"
REGION="${CAUDALS_OBJECT_STORAGE_REGION:-us-east-1}"
CDN_URL="${CAUDALS_OBJECT_STORAGE_CDN_URL:-${MINIO_API_URL}/${BUCKET}}"
ACCESS_KEY_SECRET="${CAUDALS_OBJECT_STORAGE_ACCESS_KEY_SECRET:-caudals_object_storage_access_key_id}"
SECRET_KEY_SECRET="${CAUDALS_OBJECT_STORAGE_SECRET_KEY_SECRET:-caudals_object_storage_secret_access_key}"
ACCESS_KEY_FILE="${CAUDALS_OBJECT_STORAGE_ACCESS_KEY_ID_FILE:-}"
SECRET_KEY_FILE="${CAUDALS_OBJECT_STORAGE_SECRET_ACCESS_KEY_FILE:-}"
GENERATED_DIR="${CAUDALS_GENERATED_OBJECT_STORAGE_DIR:-/root/.caudals/object-storage}"
GENERATED_ACCESS_KEY_FILE="$GENERATED_DIR/object-storage-access-key-id"
GENERATED_SECRET_KEY_FILE="$GENERATED_DIR/object-storage-secret-access-key"
CONFIGURE_APP_SERVICE="${CAUDALS_OBJECT_STORAGE_CONFIGURE_APP_SERVICE:-true}"

ensure_secret_file() {
  local source_file="$1"
  local generated_file="$2"
  local label="$3"
  local generator="$4"

  if [[ -n "$source_file" ]]; then
    if [[ ! -r "$source_file" ]]; then
      echo "$label file is not readable: $source_file" >&2
      exit 1
    fi
    printf "%s" "$source_file"
    return
  fi

  mkdir -p "$GENERATED_DIR"
  chmod 700 "$GENERATED_DIR"

  if [[ ! -s "$generated_file" ]]; then
    umask 077
    eval "$generator" >"$generated_file"
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

service_env_value() {
  local name="$1"

  docker service inspect "$APP_SERVICE" \
    --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
    2>/dev/null \
    | awk -F= -v key="$name" '$1 == key {print substr($0, index($0, "=") + 1)}' \
    | tail -n 1
}

service_has_secret_target() {
  local target="$1"

  docker service inspect "$APP_SERVICE" \
    --format '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{println .File.Name}}{{end}}' \
    2>/dev/null \
    | grep -qx "$target"
}

add_or_replace_env_arg() {
  local name="$1"
  local value="$2"
  local current

  current="$(service_env_value "$name")"
  if [[ "$current" == "$value" ]]; then
    return
  fi

  if [[ -n "$current" ]]; then
    APP_UPDATE_ARGS+=(--env-rm "$name")
  fi
  APP_UPDATE_ARGS+=(--env-add "$name=$value")
}

add_secret_arg() {
  local source="$1"
  local target="$2"

  if service_has_secret_target "$target"; then
    return
  fi

  APP_UPDATE_ARGS+=(--secret-add "source=$source,target=$target,mode=0400")
}

configure_app_service() {
  if [[ "$CONFIGURE_APP_SERVICE" != "true" ]]; then
    echo "Skipped app service object-storage wiring."
    return
  fi

  if ! docker service inspect "$APP_SERVICE" >/dev/null 2>&1; then
    echo "App service not found: $APP_SERVICE" >&2
    exit 1
  fi

  APP_UPDATE_ARGS=()
  add_or_replace_env_arg "DO_SPACES_ENDPOINT" "$MINIO_API_URL"
  add_or_replace_env_arg "DO_SPACES_FORCE_PATH_STYLE" "true"
  add_or_replace_env_arg "DO_SPACES_REGION" "$REGION"
  add_or_replace_env_arg "DO_SPACES_BUCKET" "$BUCKET"
  add_or_replace_env_arg "NEXT_PUBLIC_DO_SPACES_CDN_URL" "$CDN_URL"
  add_or_replace_env_arg "DO_SPACES_ACCESS_KEY_ID_FILE" "/run/secrets/$ACCESS_KEY_SECRET"
  add_or_replace_env_arg "DO_SPACES_SECRET_ACCESS_KEY_FILE" "/run/secrets/$SECRET_KEY_SECRET"
  add_secret_arg "$ACCESS_KEY_SECRET" "$ACCESS_KEY_SECRET"
  add_secret_arg "$SECRET_KEY_SECRET" "$SECRET_KEY_SECRET"

  if [[ "${#APP_UPDATE_ARGS[@]}" -eq 0 ]]; then
    echo "App service already has object-storage runtime configuration."
    return
  fi

  docker service update --detach=false "${APP_UPDATE_ARGS[@]}" "$APP_SERVICE" >/dev/null
  echo "Updated app service object-storage runtime configuration."
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the object-storage stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ACCESS_KEY_FILE="$(
  ensure_secret_file \
    "$ACCESS_KEY_FILE" \
    "$GENERATED_ACCESS_KEY_FILE" \
    "object storage access key" \
    "printf caudals && openssl rand -hex 12"
)"
SECRET_KEY_FILE="$(
  ensure_secret_file \
    "$SECRET_KEY_FILE" \
    "$GENERATED_SECRET_KEY_FILE" \
    "object storage secret key" \
    "openssl rand -base64 36"
)"

ensure_docker_secret "$ACCESS_KEY_SECRET" "$ACCESS_KEY_FILE" "object storage access key"
ensure_docker_secret "$SECRET_KEY_SECRET" "$SECRET_KEY_FILE" "object storage secret key"
pull_image "$MINIO_IMAGE"

CAUDALS_OBJECT_STORAGE_NETWORK="$NETWORK" \
CAUDALS_MINIO_IMAGE="$MINIO_IMAGE" \
CAUDALS_OBJECT_STORAGE_ACCESS_KEY_SECRET="$ACCESS_KEY_SECRET" \
CAUDALS_OBJECT_STORAGE_SECRET_KEY_SECRET="$SECRET_KEY_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/object-storage/docker-stack.yml" \
    "$STACK_NAME"

CAUDALS_OBJECT_STORAGE_STACK_NAME="$STACK_NAME" \
CAUDALS_OBJECT_STORAGE_NETWORK="$NETWORK" \
CAUDALS_MINIO_API_URL="$MINIO_API_URL" \
CAUDALS_OBJECT_STORAGE_BUCKET="$BUCKET" \
CAUDALS_OBJECT_STORAGE_REGION="$REGION" \
CAUDALS_OBJECT_STORAGE_CDN_URL="$CDN_URL" \
CAUDALS_OBJECT_STORAGE_ACCESS_KEY_ID_FILE="$ACCESS_KEY_FILE" \
CAUDALS_OBJECT_STORAGE_SECRET_ACCESS_KEY_FILE="$SECRET_KEY_FILE" \
  "$ROOT/scripts/probe-object-storage-stack.sh" >/dev/null

configure_app_service

cat <<MSG
Requested object-storage stack deployment: $STACK_NAME
Internal S3 endpoint:
  $MINIO_API_URL
Bucket:
  $BUCKET
Run scripts/probe-object-storage-stack.sh to verify private object-storage readiness.
MSG
