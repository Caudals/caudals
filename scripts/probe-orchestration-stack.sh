#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_ORCHESTRATION_STACK_NAME:-caudals-orchestration}"
NETWORK="${CAUDALS_ORCHESTRATION_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_ORCHESTRATION_CURL_IMAGE:-curlimages/curl:8.11.1}"
DAGSTER_CODE_SERVICE="${CAUDALS_DAGSTER_CODE_SERVICE:-${STACK_NAME}_code}"
DAGSTER_WEBSERVER_SERVICE="${CAUDALS_DAGSTER_WEBSERVER_SERVICE:-${STACK_NAME}_webserver}"
DAGSTER_WEBSERVER_URL="${CAUDALS_DAGSTER_WEBSERVER_URL:-http://caudals-orchestration-webserver:3000}"
MARQUEZ_API_URL="${CAUDALS_MARQUEZ_API_URL:-http://caudals-operations-marquez:5000}"
PROBE_ATTEMPTS="${CAUDALS_ORCHESTRATION_PROBE_ATTEMPTS:-18}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_ORCHESTRATION_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_ORCHESTRATION_PROBE_MAX_TIME_SECONDS:-20}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

if ! docker image inspect "$CURL_IMAGE" >/dev/null 2>&1; then
  docker pull -q "$CURL_IMAGE" >/dev/null
fi

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

probe_code_container() {
  local container

  printf "dagster.code\t"
  container="$(first_service_container "$DAGSTER_CODE_SERVICE")"
  if [[ -z "$container" ]]; then
    printf "no running container for service %s\n" "$DAGSTER_CODE_SERVICE"
    return 1
  fi

  if docker exec "$container" dagster api grpc-health-check -p 4000 >/dev/null 2>"$ERROR_FILE"; then
    printf "grpc healthy\n"
  else
    printf "grpc health failed: "
    tr "\n" " " <"$ERROR_FILE" | sed "s/[[:space:]]\\+/ /g" | head -c 240
    printf "\n"
    return 1
  fi
}

probe_reference_job() {
  local container
  local output

  printf "dagster.reference_job\t"
  container="$(first_service_container "$DAGSTER_CODE_SERVICE")"
  if [[ -z "$container" ]]; then
    printf "no running container for service %s\n" "$DAGSTER_CODE_SERVICE"
    return 1
  fi

  if output="$(
    docker exec "$container" sh -lc '
      if [ -n "${DAGSTER_POSTGRES_PASSWORD_FILE:-}" ]; then
        DAGSTER_POSTGRES_PASSWORD="$(tr -d "\r\n" <"$DAGSTER_POSTGRES_PASSWORD_FILE")"
        export DAGSTER_POSTGRES_PASSWORD
      fi
      cd /opt/dagster/app
      dagster job execute -f definitions.py -j caudals_reference_build
    ' 2>&1
  )"; then
    printf "executed caudals_reference_build\n"
  else
    printf "failed: "
    printf "%s" "$output" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g" | head -c 300
    printf "\n"
    return 1
  fi
}

probe_lineage_namespace() {
  local attempt

  printf "dagster.openlineage\t"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
      -fsS \
      --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
      --max-time "$PROBE_MAX_TIME_SECONDS" \
      "$MARQUEZ_API_URL/api/v1/namespaces/caudals.dagster.reference" >"$OUTPUT_FILE" 2>"$ERROR_FILE"; then
      printf "marquez namespace caudals.dagster.reference present\n"
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

probe_http "dagster.webserver" "$DAGSTER_WEBSERVER_URL/server_info"
probe_code_container
probe_reference_job
probe_lineage_namespace
