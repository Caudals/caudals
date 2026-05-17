#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_VECTOR_STACK_NAME:-caudals-vector}"
NETWORK="${CAUDALS_VECTOR_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_VECTOR_CURL_IMAGE:-curlimages/curl:8.11.1}"
QDRANT_SERVICE="${CAUDALS_QDRANT_SERVICE:-${STACK_NAME}_qdrant}"
QDRANT_URL="${CAUDALS_QDRANT_URL:-http://caudals-vector-qdrant:6333}"
QDRANT_API_KEY="${CAUDALS_QDRANT_API_KEY:-}"
QDRANT_API_KEY_FILE="${CAUDALS_QDRANT_API_KEY_FILE:-/root/.caudals/vector/qdrant-api-key}"
PROBE_COLLECTION="${CAUDALS_QDRANT_PROBE_COLLECTION:-caudals_vector_probe}"
PROBE_ATTEMPTS="${CAUDALS_VECTOR_PROBE_ATTEMPTS:-18}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_VECTOR_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_VECTOR_PROBE_MAX_TIME_SECONDS:-20}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
CURL_CONFIG_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE" "$BODY_FILE" "$CURL_CONFIG_FILE"' EXIT

ensure_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

resolve_api_key() {
  if [[ -n "$QDRANT_API_KEY" ]]; then
    return
  fi

  if [[ ! -r "$QDRANT_API_KEY_FILE" ]]; then
    echo "Qdrant API key file is not readable: $QDRANT_API_KEY_FILE" >&2
    exit 1
  fi

  QDRANT_API_KEY="$(tr -d '\r\n' <"$QDRANT_API_KEY_FILE")"
  if [[ -z "$QDRANT_API_KEY" ]]; then
    echo "Qdrant API key is empty." >&2
    exit 1
  fi
}

curl_qdrant() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  {
    printf "header = \"api-key: %s\"\n" "$QDRANT_API_KEY"
    if [[ -n "$body" ]]; then
      printf "header = \"content-type: application/json\"\n"
    fi
  } >"$CURL_CONFIG_FILE"
  chmod 600 "$CURL_CONFIG_FILE"

  if [[ -n "$body" ]]; then
    printf "%s" "$body" >"$BODY_FILE"
    docker run --rm --user 0:0 --network "$NETWORK" \
      -v "$CURL_CONFIG_FILE:/tmp/curl.conf:ro" \
      -v "$BODY_FILE:/tmp/body.json:ro" \
      "$CURL_IMAGE" \
      -q \
      --config /tmp/curl.conf \
      -fsS \
      --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
      --max-time "$PROBE_MAX_TIME_SECONDS" \
      -X "$method" \
      --data-binary @/tmp/body.json \
      "$QDRANT_URL$path" >"$OUTPUT_FILE" 2>"$ERROR_FILE"
  else
    docker run --rm --user 0:0 --network "$NETWORK" \
      -v "$CURL_CONFIG_FILE:/tmp/curl.conf:ro" \
      "$CURL_IMAGE" \
      -q \
      --config /tmp/curl.conf \
      -fsS \
      --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
      --max-time "$PROBE_MAX_TIME_SECONDS" \
      -X "$method" \
      "$QDRANT_URL$path" >"$OUTPUT_FILE" 2>"$ERROR_FILE"
  fi
}

print_probe_output() {
  if [[ -s "$OUTPUT_FILE" ]]; then
    head -c 180 "$OUTPUT_FILE" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g"
  else
    printf "ok"
  fi
  printf "\n"
}

probe_qdrant() {
  local name="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local attempt

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if curl_qdrant "$method" "$path" "$body"; then
      print_probe_output
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

probe_qdrant_collection() {
  local create_body='{"vectors":{"size":4,"distance":"Cosine"}}'
  local attempt

  printf "qdrant.collection\t"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if curl_qdrant PUT "/collections/$PROBE_COLLECTION" "$create_body"; then
      print_probe_output
      return 0
    fi

    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"
    if curl_qdrant GET "/collections/$PROBE_COLLECTION"; then
      print_probe_output
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

probe_private_service() {
  local ports

  printf "qdrant.private\t"
  ports="$(
    docker service inspect "$QDRANT_SERVICE" \
      --format '{{range .Endpoint.Ports}}{{.PublishedPort}} {{end}}' \
      2>/dev/null || true
  )"

  if [[ -n "${ports//[[:space:]]/}" ]]; then
    printf "%s publishes ports: %s\n" "$QDRANT_SERVICE" "$ports"
    return 1
  fi

  printf "no published ports\n"
}

ensure_image "$CURL_IMAGE"
resolve_api_key

probe_qdrant "qdrant.root" GET "/"
probe_qdrant_collection
probe_qdrant "qdrant.point_write" PUT "/collections/$PROBE_COLLECTION/points?wait=true" \
  '{"points":[{"id":1,"vector":[0.1,0.2,0.3,0.4],"payload":{"source":"caudals_vector_probe"}}]}'
probe_qdrant "qdrant.point_read" POST "/collections/$PROBE_COLLECTION/points" \
  '{"ids":[1],"with_payload":true,"with_vector":true}'
probe_private_service
