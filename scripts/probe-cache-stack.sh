#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_CACHE_STACK_NAME:-caudals-cache}"
NETWORK="${CAUDALS_CACHE_NETWORK:-dokploy-network}"
REDIS_IMAGE="${CAUDALS_REDIS_PROBE_IMAGE:-redis:7.4.2-alpine}"
REDIS_SERVICE="${CAUDALS_REDIS_SERVICE:-${STACK_NAME}_redis}"
REDIS_HOST="${CAUDALS_REDIS_HOST:-caudals-cache-redis}"
REDIS_PORT="${CAUDALS_REDIS_PORT:-6379}"
REDIS_PASSWORD="${CAUDALS_REDIS_PASSWORD:-}"
REDIS_PASSWORD_FILE="${CAUDALS_REDIS_PASSWORD_FILE:-/root/.caudals/cache/redis-password}"
PROBE_KEY="${CAUDALS_REDIS_PROBE_KEY:-caudals:cache:probe}"
PROBE_STREAM="${CAUDALS_REDIS_PROBE_STREAM:-caudals:queue:probe}"
PROBE_ATTEMPTS="${CAUDALS_CACHE_PROBE_ATTEMPTS:-18}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

ensure_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

resolve_password() {
  if [[ -n "$REDIS_PASSWORD" ]]; then
    return
  fi

  if [[ ! -r "$REDIS_PASSWORD_FILE" ]]; then
    echo "Redis password file is not readable: $REDIS_PASSWORD_FILE" >&2
    exit 1
  fi

  REDIS_PASSWORD="$(tr -d '\r\n' <"$REDIS_PASSWORD_FILE")"
  if [[ -z "$REDIS_PASSWORD" ]]; then
    echo "Redis password is empty." >&2
    exit 1
  fi
}

redis_cli() {
  local commands="$1"

  {
    printf "AUTH %s\r\n" "$REDIS_PASSWORD"
    printf "%b" "$commands"
  } | docker run --rm -i --network "$NETWORK" "$REDIS_IMAGE" \
    redis-cli \
    -h "$REDIS_HOST" \
    -p "$REDIS_PORT" \
    --raw >"$OUTPUT_FILE" 2>"$ERROR_FILE"
}

print_probe_output() {
  if [[ -s "$OUTPUT_FILE" ]]; then
    head -c 180 "$OUTPUT_FILE" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g"
  else
    printf "ok"
  fi
  printf "\n"
}

probe_redis() {
  local name="$1"
  local commands="$2"
  local attempt

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if redis_cli "$commands"; then
      if grep -Eq "NOAUTH|WRONGPASS|ERR invalid password" "$OUTPUT_FILE"; then
        sleep 5
        continue
      fi
      print_probe_output
      return 0
    fi

    sleep 5
  done

  printf "failed after %s attempts" "$PROBE_ATTEMPTS"
  if [[ -s "$ERROR_FILE" ]]; then
    printf ": "
    tr "\n" " " <"$ERROR_FILE" | sed "s/[[:space:]]\\+/ /g" | head -c 240
  elif [[ -s "$OUTPUT_FILE" ]]; then
    printf ": "
    tr "\n" " " <"$OUTPUT_FILE" | sed "s/[[:space:]]\\+/ /g" | head -c 240
  fi
  printf "\n"
  return 1
}

probe_private_service() {
  local ports

  printf "redis.private\t"
  ports="$(
    docker service inspect "$REDIS_SERVICE" \
      --format '{{range .Endpoint.Ports}}{{.PublishedPort}} {{end}}' \
      2>/dev/null || true
  )"

  if [[ -n "${ports//[[:space:]]/}" ]]; then
    printf "%s publishes ports: %s\n" "$REDIS_SERVICE" "$ports"
    return 1
  fi

  printf "no published ports\n"
}

ensure_image "$REDIS_IMAGE"
resolve_password

probe_redis "redis.ping" "PING\r\n"
probe_redis "redis.cache_write" "SET $PROBE_KEY ready EX 60\r\nGET $PROBE_KEY\r\n"
probe_redis "redis.queue_stream" "XADD $PROBE_STREAM MAXLEN ~ 128 * source caudals_cache_probe state ready\r\nXLEN $PROBE_STREAM\r\n"
probe_private_service
