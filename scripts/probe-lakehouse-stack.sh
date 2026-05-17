#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${CAUDALS_LAKEHOUSE_STACK_NAME:-caudals-lakehouse}"
NETWORK="${CAUDALS_LAKEHOUSE_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_LAKEHOUSE_CURL_IMAGE:-curlimages/curl:8.11.1}"
LAKEFS_SERVICE="${CAUDALS_LAKEFS_SERVICE:-${STACK_NAME}_lakefs}"
LAKEFS_API_URL="${CAUDALS_LAKEFS_API_URL:-http://caudals-lakehouse-lakefs:8000}"
PROBE_ATTEMPTS="${CAUDALS_LAKEHOUSE_PROBE_ATTEMPTS:-12}"
PROBE_CONNECT_TIMEOUT_SECONDS="${CAUDALS_LAKEHOUSE_PROBE_CONNECT_TIMEOUT_SECONDS:-5}"
PROBE_MAX_TIME_SECONDS="${CAUDALS_LAKEHOUSE_PROBE_MAX_TIME_SECONDS:-15}"
OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

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

probe_setup_state() {
  local state

  printf "lakefs.setup\t"
  state="$(
    docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
      -fsS \
      --connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS" \
      --max-time "$PROBE_MAX_TIME_SECONDS" \
      "$LAKEFS_API_URL/api/v1/setup_lakefs" \
      | node -e '
          let input = "";
          process.stdin.on("data", (chunk) => { input += chunk; });
          process.stdin.on("end", () => {
            try {
              process.stdout.write(JSON.parse(input).state ?? "");
            } catch {
              process.exit(1);
            }
          });
        '
  )"

  if [[ "$state" == "not_initialized" || -z "$state" ]]; then
    printf "not_initialized\n"
    return 1
  fi

  printf "state=%s\n" "$state"
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

probe_http "lakefs.health" "$LAKEFS_API_URL/_health"
probe_http "lakefs.api_health" "$LAKEFS_API_URL/api/v1/healthcheck"
probe_setup_state
probe_private_service "$LAKEFS_SERVICE" "lakefs.private"
