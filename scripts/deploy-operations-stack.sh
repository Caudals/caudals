#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_OPERATIONS_STACK_NAME:-caudals-operations}"
NETWORK="${CAUDALS_OPERATIONS_NETWORK:-dokploy-network}"
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres}"
MARQUEZ_SECRET="${CAUDALS_MARQUEZ_POSTGRES_SECRET:-marquez_postgres_password}"
MARQUEZ_SECRET_FILE="${CAUDALS_MARQUEZ_POSTGRES_SECRET_FILE:-}"
GENERATED_OPERATIONS_DIR="${CAUDALS_GENERATED_OPERATIONS_DIR:-/root/.caudals/operations}"
GENERATED_MARQUEZ_PASSWORD_FILE="$GENERATED_OPERATIONS_DIR/marquez-postgres-password"

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

ensure_marquez_password_file() {
  if [[ -n "$MARQUEZ_SECRET_FILE" ]]; then
    if [[ ! -r "$MARQUEZ_SECRET_FILE" ]]; then
      echo "Marquez Postgres secret file is not readable: $MARQUEZ_SECRET_FILE" >&2
      exit 1
    fi
    return
  fi

  mkdir -p "$GENERATED_OPERATIONS_DIR"
  chmod 700 "$GENERATED_OPERATIONS_DIR"

  if [[ ! -s "$GENERATED_MARQUEZ_PASSWORD_FILE" ]]; then
    umask 077
    openssl rand -base64 36 >"$GENERATED_MARQUEZ_PASSWORD_FILE"
    echo "Created root-only Marquez Postgres password file: $GENERATED_MARQUEZ_PASSWORD_FILE"
  fi

  MARQUEZ_SECRET_FILE="$GENERATED_MARQUEZ_PASSWORD_FILE"
}

ensure_marquez_secret() {
  if docker secret inspect "$MARQUEZ_SECRET" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$MARQUEZ_SECRET" "$MARQUEZ_SECRET_FILE" >/dev/null
  echo "Created Marquez Postgres Docker secret: $MARQUEZ_SECRET"
}

ensure_marquez_database() {
  local postgres_container
  local password

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    echo "No running container found for PostgreSQL service: $POSTGRES_SERVICE" >&2
    exit 1
  fi

  password="$(tr -d '\r\n' <"$MARQUEZ_SECRET_FILE")"
  if [[ -z "$password" ]]; then
    echo "Marquez Postgres password file is empty." >&2
    exit 1
  fi

  docker exec -i "$postgres_container" psql \
    -U caudals_app \
    -d caudals \
    -v ON_ERROR_STOP=1 \
    -v marquez_password="$password" <<'SQL' >/dev/null
SELECT set_config('caudals.marquez_password', :'marquez_password', false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquez') THEN
    EXECUTE format(
      'CREATE ROLE marquez LOGIN PASSWORD %L',
      current_setting('caudals.marquez_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE marquez WITH LOGIN PASSWORD %L',
      current_setting('caudals.marquez_password')
    );
  END IF;
END;
$$;

SELECT 'CREATE DATABASE marquez OWNER marquez'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'marquez')
\gexec

ALTER DATABASE marquez OWNER TO marquez;
SQL

  echo "Ensured Marquez PostgreSQL role and database."
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the operations stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ensure_marquez_password_file
ensure_marquez_secret
ensure_marquez_database

CAUDALS_OPERATIONS_NETWORK="$NETWORK" \
  docker stack deploy \
    --detach=true \
    --with-registry-auth \
    -c "$ROOT/infra/operations/docker-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested operations stack deployment: $STACK_NAME
Internal Marquez endpoints:
  http://${STACK_NAME}_marquez:5000
  http://${STACK_NAME}_marquez:5001/healthcheck
Run scripts/probe-operations-stack.sh to verify OpenLineage ingestion.
MSG
