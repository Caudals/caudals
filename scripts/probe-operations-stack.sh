#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_OPERATIONS_STACK_NAME:-caudals-operations}"
NETWORK="${CAUDALS_OPERATIONS_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_OPERATIONS_CURL_IMAGE:-curlimages/curl:8.11.1}"
MARQUEZ_SERVICE="${CAUDALS_MARQUEZ_SERVICE:-${STACK_NAME}_marquez}"
MARQUEZ_API_URL="${CAUDALS_MARQUEZ_API_URL:-http://caudals-operations-marquez:5000}"
MARQUEZ_ADMIN_URL="${CAUDALS_MARQUEZ_ADMIN_URL:-http://caudals-operations-marquez:5001}"
PROBE_ATTEMPTS="${CAUDALS_OPERATIONS_PROBE_ATTEMPTS:-12}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_OPERATIONS_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_OPERATIONS_PROBE_MAX_TIME_SECONDS:-15}"
RUN_ID="probe-$(date -u +%Y%m%dT%H%M%SZ)"
EVENT_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
EVENT_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE" "$EVENT_FILE"' EXIT

if ! docker image inspect "$CURL_IMAGE" >/dev/null 2>&1; then
  docker pull -q "$CURL_IMAGE" >/dev/null
fi

probe_http() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data_file="${4:-}"
  local attempt
  local -a curl_args
  local -a docker_args

  printf "%s\t" "$name"
  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    : >"$OUTPUT_FILE"
    : >"$ERROR_FILE"

    curl_args=(
      -fsS
      --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS"
      --max-time "$PROBE_MAX_TIME_SECONDS"
      -X "$method"
      "$url"
    )
    docker_args=(--rm --network "$NETWORK")
    if [[ -n "$data_file" ]]; then
      docker_args+=(-v "$data_file:/tmp/payload.json:ro")
      curl_args+=(-H "Content-Type: application/json" --data-binary "@/tmp/payload.json")
    fi

    if docker run "${docker_args[@]}" "$CURL_IMAGE" "${curl_args[@]}" >"$OUTPUT_FILE" 2>"$ERROR_FILE"; then
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

cat >"$EVENT_FILE" <<JSON
{
  "eventType": "COMPLETE",
  "eventTime": "$EVENT_TIME",
  "run": {
    "runId": "$RUN_ID"
  },
  "job": {
    "namespace": "caudals.probe",
    "name": "operations-stack-probe"
  },
  "inputs": [
    {
      "namespace": "caudals.bronze",
      "name": "probe/source"
    }
  ],
  "outputs": [
    {
      "namespace": "caudals.gold",
      "name": "probe/release"
    }
  ],
  "producer": "https://caudals.com/internal/operations-probe",
  "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent"
}
JSON
chmod 644 "$EVENT_FILE"

probe_http "marquez.admin" "GET" "$MARQUEZ_ADMIN_URL/healthcheck"
probe_http "marquez.namespaces" "GET" "$MARQUEZ_API_URL/api/v1/namespaces"
probe_http "openlineage.ingest" "POST" "$MARQUEZ_API_URL/api/v1/lineage" "$EVENT_FILE"
