#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${SUPABASE_SELFHOSTED_ENV_FILE:-$HOME/.config/caudals/supabase-selfhosted.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${SUPABASE_SSH_HOST:?Missing SUPABASE_SSH_HOST in $ENV_FILE}"
: "${SUPABASE_MCP_LOCAL_PORT:?Missing SUPABASE_MCP_LOCAL_PORT in $ENV_FILE}"
: "${SUPABASE_DB_LOCAL_PORT:?Missing SUPABASE_DB_LOCAL_PORT in $ENV_FILE}"
: "${SUPABASE_REMOTE_KONG_PORT:?Missing SUPABASE_REMOTE_KONG_PORT in $ENV_FILE}"
: "${SUPABASE_REMOTE_DB_PORT:?Missing SUPABASE_REMOTE_DB_PORT in $ENV_FILE}"

SOCKET_DIR="${TMPDIR:-/tmp}"
MCP_SOCKET="$SOCKET_DIR/caudals-supabase-mcp.sock"
DB_SOCKET="$SOCKET_DIR/caudals-supabase-db.sock"

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|status> [mcp|db|all]

Defaults:
  action: status
  target: all
EOF
}

is_running() {
  local socket="$1"
  if ssh -S "$socket" -O check "$SUPABASE_SSH_HOST" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

resolve_remote_db_host() {
  local configured="${SUPABASE_REMOTE_DB_HOST:-auto}"
  if [[ "$configured" != "auto" ]]; then
    printf "%s" "$configured"
    return 0
  fi

  ssh "$SUPABASE_SSH_HOST" "docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' supabase-db"
}

start_one() {
  local socket="$1"
  local local_port="$2"
  local remote_host="$3"
  local remote_port="$4"
  local label="$5"

  if is_running "$socket"; then
    echo "$label tunnel already running on 127.0.0.1:$local_port"
    return 0
  fi

  ssh -fN \
    -M -S "$socket" \
    -o ExitOnForwardFailure=yes \
    -L "${local_port}:${remote_host}:${remote_port}" \
    "$SUPABASE_SSH_HOST"

  echo "Started $label tunnel: 127.0.0.1:$local_port -> $SUPABASE_SSH_HOST:${remote_host}:$remote_port"
}

stop_one() {
  local socket="$1"
  local label="$2"

  if is_running "$socket"; then
    ssh -S "$socket" -O exit "$SUPABASE_SSH_HOST" >/dev/null
    echo "Stopped $label tunnel"
  else
    echo "$label tunnel is not running"
  fi
}

status_one() {
  local socket="$1"
  local local_port="$2"
  local label="$3"

  if is_running "$socket"; then
    echo "$label: running on 127.0.0.1:$local_port"
  else
    echo "$label: stopped"
  fi
}

ACTION="${1:-status}"
TARGET="${2:-all}"

case "$ACTION" in
  start|stop|status) ;;
  *)
    usage
    exit 1
    ;;
esac

run_target() {
  local target="$1"
  case "$target" in
    mcp)
      case "$ACTION" in
        start) start_one "$MCP_SOCKET" "$SUPABASE_MCP_LOCAL_PORT" "127.0.0.1" "$SUPABASE_REMOTE_KONG_PORT" "MCP" ;;
        stop) stop_one "$MCP_SOCKET" "MCP" ;;
        status) status_one "$MCP_SOCKET" "$SUPABASE_MCP_LOCAL_PORT" "MCP" ;;
      esac
      ;;
    db)
      case "$ACTION" in
        start)
          REMOTE_DB_HOST="$(resolve_remote_db_host)"
          start_one "$DB_SOCKET" "$SUPABASE_DB_LOCAL_PORT" "$REMOTE_DB_HOST" "$SUPABASE_REMOTE_DB_PORT" "DB"
          ;;
        stop) stop_one "$DB_SOCKET" "DB" ;;
        status) status_one "$DB_SOCKET" "$SUPABASE_DB_LOCAL_PORT" "DB" ;;
      esac
      ;;
    all)
      run_target mcp
      run_target db
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

run_target "$TARGET"
