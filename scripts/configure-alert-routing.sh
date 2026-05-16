#!/usr/bin/env bash
set -euo pipefail

ALERTMANAGER_WEBHOOK_URL_INPUT="${CAUDALS_ALERTMANAGER_WEBHOOK_URL:-}"
ALERTMANAGER_WEBHOOK_URL_INPUT_FILE="${CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE:-}"

if [[ -n "$ALERTMANAGER_WEBHOOK_URL_INPUT_FILE" ]]; then
  if [[ ! -r "$ALERTMANAGER_WEBHOOK_URL_INPUT_FILE" ]]; then
    echo "Alertmanager webhook URL file is not readable: $ALERTMANAGER_WEBHOOK_URL_INPUT_FILE" >&2
    exit 1
  fi
  ALERTMANAGER_WEBHOOK_URL_INPUT="$(tr -d '\r\n' <"$ALERTMANAGER_WEBHOOK_URL_INPUT_FILE")"
fi

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

if [[ -z "$ALERTMANAGER_WEBHOOK_URL_INPUT" ]]; then
  cat >&2 <<MSG
No Alertmanager webhook URL was provided.
Set CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE to a local file containing the
production on-call webhook URL, or set CAUDALS_ALERTMANAGER_WEBHOOK_URL for this
command only. The URL will not be printed.
MSG
  exit 1
fi

if ! validate_webhook_url "$ALERTMANAGER_WEBHOOK_URL_INPUT"; then
  echo "Alertmanager webhook URL failed validation; expected an https URL." >&2
  exit 1
fi

export CAUDALS_ALERTMANAGER_WEBHOOK_URL="$ALERTMANAGER_WEBHOOK_URL_INPUT"

scripts/deploy-observability-stack.sh

echo "Configured Alertmanager external webhook receiver without printing the webhook URL."
