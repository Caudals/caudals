#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_LABELING_STACK_NAME:-caudals-labeling}"
NETWORK="${CAUDALS_LABELING_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_LABELING_CURL_IMAGE:-curlimages/curl:8.11.1}"
POSTGRES_IMAGE="${CAUDALS_LABEL_STUDIO_POSTGRES_PROBE_IMAGE:-postgres:16-alpine}"
LABEL_STUDIO_SERVICE="${CAUDALS_LABEL_STUDIO_SERVICE:-${STACK_NAME}_label-studio}"
POSTGRES_SERVICE="${CAUDALS_LABEL_STUDIO_POSTGRES_SERVICE:-${STACK_NAME}_postgres}"
LABEL_STUDIO_URL="${CAUDALS_LABEL_STUDIO_URL:-http://caudals-labeling-label-studio:8080}"
POSTGRES_HOST="${CAUDALS_LABEL_STUDIO_POSTGRES_HOST:-caudals-labeling-postgres}"
POSTGRES_PORT="${CAUDALS_LABEL_STUDIO_POSTGRES_PORT:-5432}"
POSTGRES_DB="${CAUDALS_LABEL_STUDIO_POSTGRES_DB:-labelstudio}"
POSTGRES_USER="${CAUDALS_LABEL_STUDIO_POSTGRES_USER:-labelstudio}"
POSTGRES_PASSWORD="${CAUDALS_LABEL_STUDIO_POSTGRES_PASSWORD:-}"
POSTGRES_PASSWORD_FILE="${CAUDALS_LABEL_STUDIO_POSTGRES_PASSWORD_FILE:-/root/.caudals/labeling/label-studio-postgres-password}"
PROBE_ATTEMPTS="${CAUDALS_LABELING_PROBE_ATTEMPTS:-24}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_LABELING_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_LABELING_PROBE_MAX_TIME_SECONDS:-20}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

ensure_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

resolve_postgres_password() {
  if [[ -n "$POSTGRES_PASSWORD" ]]; then
    return
  fi

  if [[ ! -r "$POSTGRES_PASSWORD_FILE" ]]; then
    echo "Label Studio PostgreSQL password file is not readable: $POSTGRES_PASSWORD_FILE" >&2
    exit 1
  fi

  POSTGRES_PASSWORD="$(tr -d '\r\n' <"$POSTGRES_PASSWORD_FILE")"
  if [[ -z "$POSTGRES_PASSWORD" ]]; then
    echo "Label Studio PostgreSQL password is empty." >&2
    exit 1
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

probe_http() {
  local attempt status

  printf "label_studio.http\t"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    status="$(
      docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
        -k \
        -sS \
        -o /dev/null \
        -w "%{http_code}" \
        --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
        --max-time "$PROBE_MAX_TIME_SECONDS" \
        "$LABEL_STUDIO_URL/" 2>"$ERROR_FILE" || true
    )"

    if [[ "$status" =~ ^(200|302|303)$ ]]; then
      printf "status=%s\n" "$status"
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

probe_postgres() {
  local attempt

  printf "label_studio.postgres\t"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if docker run --rm --network "$NETWORK" \
      -e PGPASSWORD="$POSTGRES_PASSWORD" \
      "$POSTGRES_IMAGE" \
      psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -v ON_ERROR_STOP=1 \
        -At \
        -c "select count(*)::int from django_migrations;" \
        >"$OUTPUT_FILE" 2>"$ERROR_FILE"; then
      printf "migrations="
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
ensure_image "$POSTGRES_IMAGE"
resolve_postgres_password

probe_http
probe_postgres
probe_private_service "$LABEL_STUDIO_SERVICE" "label_studio.private"
probe_private_service "$POSTGRES_SERVICE" "label_studio.postgres_private"
