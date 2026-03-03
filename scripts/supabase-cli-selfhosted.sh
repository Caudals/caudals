#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${SUPABASE_SELFHOSTED_ENV_FILE:-$HOME/.config/caudals/supabase-selfhosted.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${SUPABASE_DB_USER:?Missing SUPABASE_DB_USER in $ENV_FILE}"
: "${SUPABASE_DB_PASSWORD:?Missing SUPABASE_DB_PASSWORD in $ENV_FILE}"
: "${SUPABASE_DB_NAME:?Missing SUPABASE_DB_NAME in $ENV_FILE}"
: "${SUPABASE_DB_LOCAL_PORT:?Missing SUPABASE_DB_LOCAL_PORT in $ENV_FILE}"

if [[ $# -eq 0 ]]; then
  echo "Usage: $(basename "$0") <supabase-command...>"
  echo "Example: $(basename "$0") migration list"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/supabase-selfhosted-tunnel.sh" start db >/dev/null

ENCODED_PASS="$(node -p "encodeURIComponent(process.argv[1])" "$SUPABASE_DB_PASSWORD")"
DB_URL="postgresql://${SUPABASE_DB_USER}:${ENCODED_PASS}@127.0.0.1:${SUPABASE_DB_LOCAL_PORT}/${SUPABASE_DB_NAME}"

export PGSSLMODE=disable
exec supabase "$@" --db-url "$DB_URL"
