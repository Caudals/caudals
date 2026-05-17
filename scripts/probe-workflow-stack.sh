#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_WORKFLOW_STACK_NAME:-caudals-workflow}"
NETWORK="${CAUDALS_WORKFLOW_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_WORKFLOW_CURL_IMAGE:-curlimages/curl:8.11.1}"
TEMPORAL_ADMIN_TOOLS_IMAGE="${CAUDALS_TEMPORAL_ADMIN_TOOLS_IMAGE:-temporalio/admin-tools:1.31.0}"
TEMPORAL_SERVER_SERVICE="${CAUDALS_TEMPORAL_SERVER_SERVICE:-${STACK_NAME}_temporal}"
TEMPORAL_UI_SERVICE="${CAUDALS_TEMPORAL_UI_SERVICE:-${STACK_NAME}_ui}"
TEMPORAL_ADDRESS="${CAUDALS_TEMPORAL_ADDRESS:-caudals-workflow-temporal:7233}"
TEMPORAL_NAMESPACE="${CAUDALS_TEMPORAL_NAMESPACE:-caudals-operations}"
TEMPORAL_UI_URL="${CAUDALS_TEMPORAL_UI_URL:-http://caudals-workflow-ui:8080}"
PROBE_ATTEMPTS="${CAUDALS_WORKFLOW_PROBE_ATTEMPTS:-18}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_WORKFLOW_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_WORKFLOW_PROBE_MAX_TIME_SECONDS:-20}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

ensure_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

probe_temporal_cli() {
  local name="$1"
  shift
  local attempt

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    if docker run --rm --network "$NETWORK" "$TEMPORAL_ADMIN_TOOLS_IMAGE" \
      temporal "$@" >"$OUTPUT_FILE" 2>"$ERROR_FILE"; then
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
  if [[ -s "$ERROR_FILE" ]]; then
    printf ": "
    tr "\n" " " <"$ERROR_FILE" | sed "s/[[:space:]]\\+/ /g" | head -c 240
  fi
  printf "\n"
  return 1
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
        head -c 120 "$OUTPUT_FILE" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g"
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

probe_private_services() {
  local service
  local ports

  printf "temporal.private\t"
  for service in "$TEMPORAL_SERVER_SERVICE" "$TEMPORAL_UI_SERVICE"; do
    ports="$(
      docker service inspect "$service" \
        --format '{{range .Endpoint.Ports}}{{.PublishedPort}} {{end}}' \
        2>/dev/null || true
    )"
    if [[ -n "${ports//[[:space:]]/}" ]]; then
      printf "%s publishes ports: %s\n" "$service" "$ports"
      return 1
    fi
  done

  printf "no published ports\n"
}

ensure_image "$TEMPORAL_ADMIN_TOOLS_IMAGE"
ensure_image "$CURL_IMAGE"

probe_temporal_cli "temporal.cluster" operator cluster health --address "$TEMPORAL_ADDRESS"
probe_temporal_cli "temporal.namespace" operator namespace describe --namespace "$TEMPORAL_NAMESPACE" --address "$TEMPORAL_ADDRESS"
probe_http "temporal.ui" "$TEMPORAL_UI_URL"
probe_private_services
