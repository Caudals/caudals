#!/usr/bin/env bash
set -euo pipefail

NETWORK="${CAUDALS_OBSERVABILITY_NETWORK:-dokploy-network}"
CURL_IMAGE="${CAUDALS_OBSERVABILITY_CURL_IMAGE:-curlimages/curl:8.11.1}"
OUTPUT_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE"' EXIT

if ! docker image inspect "$CURL_IMAGE" >/dev/null 2>&1; then
  docker pull -q "$CURL_IMAGE" >/dev/null
fi

probe() {
  local name="$1"
  local url="$2"
  local attempt

  printf "%s\t" "$name"
  for attempt in {1..12}; do
    if docker run --rm --network "$NETWORK" "$CURL_IMAGE" -fsS "$url" >"$OUTPUT_FILE"; then
      head -c 120 "$OUTPUT_FILE"
      printf "\n"
      return 0
    fi

    sleep 5
  done

  printf "failed after %s attempts\n" "$attempt"
  return 1
}

probe "tempo" "http://tempo:3200/ready"
probe "loki" "http://loki:3100/ready"
probe "prometheus" "http://prometheus:9090/-/ready"
probe "alertmanager" "http://alertmanager:9093/-/ready"
probe "promtail" "http://promtail:9080/ready"
probe "cadvisor" "http://cadvisor:8080/healthz"
probe "grafana" "http://grafana:3000/api/health"
