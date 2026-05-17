#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_OBJECT_STORAGE_STACK_NAME:-caudals-object-storage}"
NETWORK="${CAUDALS_OBJECT_STORAGE_NETWORK:-dokploy-network}"
MINIO_SERVICE="${CAUDALS_MINIO_SERVICE:-${STACK_NAME}_minio}"
MINIO_API_URL="${CAUDALS_MINIO_API_URL:-http://caudals-object-storage-minio:9000}"
BUCKET="${CAUDALS_OBJECT_STORAGE_BUCKET:-caudals-storage}"
REGION="${CAUDALS_OBJECT_STORAGE_REGION:-us-east-1}"
CDN_URL="${CAUDALS_OBJECT_STORAGE_CDN_URL:-${MINIO_API_URL}/${BUCKET}}"
CURL_IMAGE="${CAUDALS_OBJECT_STORAGE_CURL_IMAGE:-curlimages/curl:8.11.1}"
NODE_IMAGE="${CAUDALS_OBJECT_STORAGE_NODE_IMAGE:-node:20-bookworm-slim}"
GENERATED_DIR="${CAUDALS_GENERATED_OBJECT_STORAGE_DIR:-/root/.caudals/object-storage}"
ACCESS_KEY_FILE="${CAUDALS_OBJECT_STORAGE_ACCESS_KEY_ID_FILE:-${GENERATED_DIR}/object-storage-access-key-id}"
SECRET_KEY_FILE="${CAUDALS_OBJECT_STORAGE_SECRET_ACCESS_KEY_FILE:-${GENERATED_DIR}/object-storage-secret-access-key}"
PROBE_ATTEMPTS="${CAUDALS_OBJECT_STORAGE_PROBE_ATTEMPTS:-12}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_OBJECT_STORAGE_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_OBJECT_STORAGE_PROBE_MAX_TIME_SECONDS:-15}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

require_file() {
  local file="$1"
  local label="$2"

  if [[ ! -r "$file" ]]; then
    echo "$label file is not readable: $file" >&2
    exit 1
  fi
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

probe_http() {
  local name="$1"
  local url="$2"
  local attempt

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
      -fsS \
      --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
      --max-time "$PROBE_MAX_TIME_SECONDS" \
      "$url" >"$OUTPUT_FILE" 2>"$ERROR_FILE"; then
      if [[ -s "$OUTPUT_FILE" ]]; then
        head -c 160 "$OUTPUT_FILE"
      else
        printf "ok"
      fi
      printf "\n"
      return 0
    fi

    sleep 5
  done

  printf "failed after %s attempts" "$PROBE_ATTEMPTS"
  if [[ -s "$ERROR_FILE" ]]; then
    printf ": "
    tr "\n" " " <"$ERROR_FILE" | sed "s/[[:space:]]\\+/ /g" | head -c 240
  fi
  printf "\n"
  return 1
}

run_node_probe() {
  local label="$1"
  local command="$2"
  local output

  printf "%s\t" "$label"
  if output="$(
    docker run --rm \
      --network "$NETWORK" \
      -v "$ROOT:/workspace:ro" \
      -v "$ACCESS_KEY_FILE:/run/caudals/object-storage-access-key-id:ro" \
      -v "$SECRET_KEY_FILE:/run/caudals/object-storage-secret-access-key:ro" \
      -w /workspace \
      -e DO_SPACES_ENDPOINT="$MINIO_API_URL" \
      -e DO_SPACES_FORCE_PATH_STYLE=true \
      -e DO_SPACES_REGION="$REGION" \
      -e DO_SPACES_BUCKET="$BUCKET" \
      -e DO_SPACES_ACCESS_KEY_ID_FILE=/run/caudals/object-storage-access-key-id \
      -e DO_SPACES_SECRET_ACCESS_KEY_FILE=/run/caudals/object-storage-secret-access-key \
      -e NEXT_PUBLIC_DO_SPACES_CDN_URL="$CDN_URL" \
      "$NODE_IMAGE" \
      sh -lc "$command" 2>&1
  )"; then
    printf "%s\n" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
    return 0
  fi

  printf "%s\n" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  return 1
}

probe_private_service() {
  local service_name="$1"
  local label="$2"
  local ports

  printf "%s\t" "$label"
  ports="$(
    docker service inspect "$service_name" \
      --format '{{json .Endpoint.Ports}}' 2>/dev/null || true
  )"

  if [[ -z "$ports" || "$ports" == "null" || "$ports" == "[]" ]]; then
    printf "no published ports\n"
    return 0
  fi

  printf "published ports present: %s\n" "$ports"
  return 1
}

require_file "$ACCESS_KEY_FILE" "object storage access key"
require_file "$SECRET_KEY_FILE" "object storage secret key"
pull_image "$CURL_IMAGE"
pull_image "$NODE_IMAGE"

probe_http "object_storage.health" "$MINIO_API_URL/minio/health/ready"
run_node_probe "object_storage.bucket" "npm run -s object-storage:ensure-bucket"
run_node_probe "object_storage.write_read_delete" "npm run -s storage:probe"
probe_private_service "$MINIO_SERVICE" "object_storage.private"
