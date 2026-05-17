#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_CVAT_STACK_NAME:-caudals-cvat}"
NETWORK="${CAUDALS_LABELING_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_CVAT_CURL_IMAGE:-curlimages/curl:8.11.1}"
REDIS_IMAGE="${CAUDALS_CVAT_REDIS_PROBE_IMAGE:-redis:7.2.11-alpine}"
CVAT_SERVER_URL="${CAUDALS_CVAT_SERVER_URL:-http://caudals-labeling-cvat-server:8080/api/server/about}"
CVAT_UI_URL="${CAUDALS_CVAT_UI_URL:-http://caudals-labeling-cvat-ui:8000}"
CVAT_CLICKHOUSE_URL="${CAUDALS_CVAT_CLICKHOUSE_URL:-http://caudals-labeling-cvat-clickhouse:8123/ping}"
PROBE_ATTEMPTS="${CAUDALS_CVAT_PROBE_ATTEMPTS:-24}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_CVAT_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_CVAT_PROBE_MAX_TIME_SECONDS:-20}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

ensure_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

probe_http() {
  local name="$1"
  local url="$2"
  local accepted_status="$3"
  local attempt status

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    status="$(
      docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
        -k \
        -sS \
        -o "$OUTPUT_FILE" \
        -w "%{http_code}" \
        --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
        --max-time "$PROBE_MAX_TIME_SECONDS" \
        "$url" 2>"$ERROR_FILE" || true
    )"

    if [[ "$status" =~ $accepted_status ]]; then
      printf "status=%s " "$status"
      if [[ -s "$OUTPUT_FILE" ]]; then
        head -c 180 "$OUTPUT_FILE" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g"
      else
        printf "ok"
      fi
      printf "\n"
      return 0
    fi

    sleep 5
  done

  printf "failed after %s attempts" "$PROBE_ATTEMPTS"
  if [[ -n "${status:-}" ]]; then
    printf ": status=%s" "$status"
  fi
  if [[ -s "$ERROR_FILE" ]]; then
    printf " "
    tr "\n" " " <"$ERROR_FILE" | sed "s/[[:space:]]\\+/ /g" | head -c 240
  fi
  printf "\n"
  return 1
}

probe_redis() {
  local host="$1"
  local name="$2"
  local port="${3:-6379}"
  local attempt output

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    if output="$(docker run --rm --network "$NETWORK" "$REDIS_IMAGE" redis-cli -h "$host" -p "$port" ping 2>&1)"; then
      printf "%s\n" "$output"
      return 0
    fi
    sleep 5
  done

  printf "failed after %s attempts: %s\n" "$PROBE_ATTEMPTS" "$output"
  return 1
}

probe_private_service() {
  local service="$1"
  local name="$2"
  local ports

  printf "%s\t" "$name"
  ports="$(
    docker service inspect "$service" \
      --format '{{range .Endpoint.Ports}}{{.PublishedPort}} {{end}}' \
      2>/dev/null || true
  )"

  if [[ -n "${ports//[[:space:]]/}" ]]; then
    printf "%s publishes ports: %s\n" "$service" "$ports"
    return 1
  fi

  printf "no published ports\n"
}

ensure_image "$CURL_IMAGE"
ensure_image "$REDIS_IMAGE"

probe_http "cvat.server" "$CVAT_SERVER_URL" "^(200)$"
probe_http "cvat.ui" "$CVAT_UI_URL" "^(200|302|303)$"
probe_http "cvat.clickhouse" "$CVAT_CLICKHOUSE_URL" "^(200)$"
probe_redis "caudals-labeling-cvat-redis-inmem" "cvat.redis_inmem" "6379"
probe_redis "caudals-labeling-cvat-redis-ondisk" "cvat.redis_ondisk" "6666"

for service in \
  cvat-server \
  cvat-ui \
  cvat-db \
  cvat-redis-inmem \
  cvat-redis-ondisk \
  cvat-clickhouse \
  cvat-opa
do
  probe_private_service "${STACK_NAME}_${service}" "cvat.private.${service}"
done
