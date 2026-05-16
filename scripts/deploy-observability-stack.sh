#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_OBSERVABILITY_STACK_NAME:-caudals-observability}"
NETWORK="${CAUDALS_OBSERVABILITY_NETWORK:-dokploy-network}"
GRAFANA_SECRET="${CAUDALS_OBSERVABILITY_GRAFANA_SECRET:-caudals_observability_grafana_admin_password}"
ALERTMANAGER_CONFIG_PATH="${CAUDALS_ALERTMANAGER_CONFIG_PATH:-$ROOT/infra/observability/alertmanager.yaml}"
ALERTMANAGER_WEBHOOK_URL="${CAUDALS_ALERTMANAGER_WEBHOOK_URL:-}"
ALERTMANAGER_WEBHOOK_URL_FILE="${CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE:-}"
GENERATED_OBSERVABILITY_DIR="${CAUDALS_GENERATED_OBSERVABILITY_DIR:-/root/.caudals/observability}"

render_external_alertmanager_config() {
  local webhook_url="$1"
  local generated_config="$GENERATED_OBSERVABILITY_DIR/alertmanager.generated.yaml"
  local escaped_webhook_url

  if [[ -z "$webhook_url" ]]; then
    return 0
  fi

  mkdir -p "$GENERATED_OBSERVABILITY_DIR"
  chmod 700 "$GENERATED_OBSERVABILITY_DIR"
  escaped_webhook_url="$(
    ALERTMANAGER_WEBHOOK_URL="$webhook_url" \
      node -e 'process.stdout.write(JSON.stringify(process.env.ALERTMANAGER_WEBHOOK_URL || ""))'
  )"

  umask 077
  cat >"$generated_config" <<YAML
global:
  resolve_timeout: 5m

route:
  receiver: caudals-external
  group_by:
    - alertname
    - job
    - severity
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: caudals-external
    webhook_configs:
      - url: $escaped_webhook_url
        send_resolved: true
YAML

  ALERTMANAGER_CONFIG_PATH="$generated_config"
  echo "Rendered external Alertmanager receiver config: $generated_config"
}

validate_webhook_url() {
  local webhook_url="$1"

  ALERTMANAGER_WEBHOOK_URL="$webhook_url" node -e '
    const value = process.env.ALERTMANAGER_WEBHOOK_URL || "";
    try {
      const url = new URL(value);
      if (!["https:"].includes(url.protocol) || !url.host) {
        process.exit(1);
      }
    } catch {
      process.exit(1);
    }
  '
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the observability stack." >&2
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

if [[ -n "$ALERTMANAGER_WEBHOOK_URL_FILE" ]]; then
  if [[ ! -r "$ALERTMANAGER_WEBHOOK_URL_FILE" ]]; then
    echo "Alertmanager webhook URL file is not readable: $ALERTMANAGER_WEBHOOK_URL_FILE" >&2
    exit 1
  fi
  ALERTMANAGER_WEBHOOK_URL="$(tr -d '\r\n' <"$ALERTMANAGER_WEBHOOK_URL_FILE")"
fi

if [[ -n "$ALERTMANAGER_WEBHOOK_URL" ]] && ! validate_webhook_url "$ALERTMANAGER_WEBHOOK_URL"; then
  echo "Alertmanager webhook URL failed validation; expected an https URL." >&2
  exit 1
fi

render_external_alertmanager_config "$ALERTMANAGER_WEBHOOK_URL"

CAUDALS_ROOT="$ROOT" \
CAUDALS_OBSERVABILITY_NETWORK="$NETWORK" \
CAUDALS_OBSERVABILITY_GRAFANA_SECRET="$GRAFANA_SECRET" \
CAUDALS_ALERTMANAGER_CONFIG_PATH="$ALERTMANAGER_CONFIG_PATH" \
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
Set CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE or CAUDALS_ALERTMANAGER_WEBHOOK_URL
before redeploying when production on-call routing credentials are available.
MSG
