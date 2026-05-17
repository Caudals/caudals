#!/bin/sh
set -eu

if [ -n "${DAGSTER_POSTGRES_PASSWORD_FILE:-}" ]; then
  if [ ! -r "$DAGSTER_POSTGRES_PASSWORD_FILE" ]; then
    echo "Dagster Postgres password file is not readable." >&2
    exit 1
  fi
  DAGSTER_POSTGRES_PASSWORD="$(tr -d '\r\n' <"$DAGSTER_POSTGRES_PASSWORD_FILE")"
  export DAGSTER_POSTGRES_PASSWORD
fi

if [ -z "${DAGSTER_POSTGRES_PASSWORD:-}" ]; then
  echo "DAGSTER_POSTGRES_PASSWORD or DAGSTER_POSTGRES_PASSWORD_FILE is required." >&2
  exit 1
fi

exec "$@"
