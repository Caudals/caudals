#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_OBSERVABILITY_STACK_NAME:-caudals-observability}"
NETWORK="${CAUDALS_OBSERVABILITY_NETWORK:-dokploy-network}"
GRAFANA_SECRET="${CAUDALS_OBSERVABILITY_GRAFANA_SECRET:-caudals_observability_grafana_admin_password}"

if [[ "$(docker info --format '{{.Swarm.LocalNodeState}}')" != "active" ]]; then
  echo "Docker Swarm must be active before deploying the observability stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

if ! docker secret inspect "$GRAFANA_SECRET" >/dev/null 2>&1; then
  openssl rand -base64 32 | docker secret create "$GRAFANA_SECRET" - >/dev/null
  echo "Created Grafana admin password Docker secret: $GRAFANA_SECRET"
fi

CAUDALS_ROOT="$ROOT" \
CAUDALS_OBSERVABILITY_NETWORK="$NETWORK" \
CAUDALS_OBSERVABILITY_GRAFANA_SECRET="$GRAFANA_SECRET" \
  docker stack deploy \
    --detach=true \
    --with-registry-auth \
    -c "$ROOT/infra/observability/docker-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested observability stack deployment: $STACK_NAME
Configure the app service with:
  OTEL_SERVICE_NAME=caudals-web
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://caudals-observability-tempo:4318/v1/traces
MSG
