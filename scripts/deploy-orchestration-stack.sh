#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_ORCHESTRATION_STACK_NAME:-caudals-orchestration}"
NETWORK="${CAUDALS_ORCHESTRATION_NETWORK:-dokploy-network}"
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres}"
DAGSTER_IMAGE_REPOSITORY="${CAUDALS_DAGSTER_IMAGE_REPOSITORY:-${CAUDALS_DOCKERHUB_REPOSITORY:-mariomedpar/caudals}}"
DAGSTER_IMAGE="${CAUDALS_DAGSTER_IMAGE:-${DAGSTER_IMAGE_REPOSITORY}:orchestration-latest}"
DAGSTER_BUILD_LOCAL="${CAUDALS_DAGSTER_BUILD_LOCAL:-false}"
DAGSTER_SECRET="${CAUDALS_DAGSTER_POSTGRES_SECRET:-dagster_postgres_password}"
DAGSTER_SECRET_FILE="${CAUDALS_DAGSTER_POSTGRES_SECRET_FILE:-}"
GENERATED_ORCHESTRATION_DIR="${CAUDALS_GENERATED_ORCHESTRATION_DIR:-/root/.caudals/orchestration}"
GENERATED_DAGSTER_PASSWORD_FILE="$GENERATED_ORCHESTRATION_DIR/dagster-postgres-password"

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

ensure_dagster_password_file() {
  if [[ -n "$DAGSTER_SECRET_FILE" ]]; then
    if [[ ! -r "$DAGSTER_SECRET_FILE" ]]; then
      echo "Dagster Postgres secret file is not readable: $DAGSTER_SECRET_FILE" >&2
      exit 1
    fi
    return
  fi

  mkdir -p "$GENERATED_ORCHESTRATION_DIR"
  chmod 700 "$GENERATED_ORCHESTRATION_DIR"

  if [[ ! -s "$GENERATED_DAGSTER_PASSWORD_FILE" ]]; then
    umask 077
    openssl rand -base64 36 >"$GENERATED_DAGSTER_PASSWORD_FILE"
    echo "Created root-only Dagster Postgres password file: $GENERATED_DAGSTER_PASSWORD_FILE"
  fi

  DAGSTER_SECRET_FILE="$GENERATED_DAGSTER_PASSWORD_FILE"
}

ensure_dagster_secret() {
  if docker secret inspect "$DAGSTER_SECRET" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$DAGSTER_SECRET" "$DAGSTER_SECRET_FILE" >/dev/null
  echo "Created Dagster Postgres Docker secret: $DAGSTER_SECRET"
}

ensure_dagster_database() {
  local postgres_container
  local password

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    echo "No running container found for PostgreSQL service: $POSTGRES_SERVICE" >&2
    exit 1
  fi

  password="$(tr -d '\r\n' <"$DAGSTER_SECRET_FILE")"
  if [[ -z "$password" ]]; then
    echo "Dagster Postgres password file is empty." >&2
    exit 1
  fi

  docker exec -i "$postgres_container" psql \
    -U caudals_app \
    -d caudals \
    -v ON_ERROR_STOP=1 \
    -v dagster_password="$password" <<'SQL' >/dev/null
SELECT set_config('caudals.dagster_password', :'dagster_password', false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dagster') THEN
    EXECUTE format(
      'CREATE ROLE dagster LOGIN PASSWORD %L',
      current_setting('caudals.dagster_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE dagster WITH LOGIN PASSWORD %L',
      current_setting('caudals.dagster_password')
    );
  END IF;
END;
$$;

SELECT 'CREATE DATABASE dagster OWNER dagster'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'dagster')
\gexec

ALTER DATABASE dagster OWNER TO dagster;
ALTER DATABASE dagster SET timezone TO 'UTC';
SQL

  echo "Ensured Dagster PostgreSQL role and database."
}

ensure_dagster_image() {
  if [[ "$DAGSTER_BUILD_LOCAL" =~ ^(1|true|yes)$ ]]; then
    docker build \
      --pull \
      -t "$DAGSTER_IMAGE" \
      "$ROOT/services/orchestration"
    return
  fi

  docker pull "$DAGSTER_IMAGE" >/dev/null
  echo "Pulled Dagster image from registry: $DAGSTER_IMAGE"
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the orchestration stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ensure_dagster_password_file
ensure_dagster_secret
ensure_dagster_database
ensure_dagster_image

CAUDALS_ORCHESTRATION_NETWORK="$NETWORK" \
CAUDALS_DAGSTER_IMAGE="$DAGSTER_IMAGE" \
  docker stack deploy \
    --detach=true \
    --with-registry-auth \
    -c "$ROOT/infra/orchestration/docker-stack.yml" \
    "$STACK_NAME"

for service in code webserver daemon; do
  docker service update \
    --force \
    --image "$DAGSTER_IMAGE" \
    --with-registry-auth \
    --detach=true \
    "${STACK_NAME}_${service}" >/dev/null
done

cat <<MSG
Requested orchestration stack deployment: $STACK_NAME
Internal Dagster endpoints:
  http://caudals-orchestration-webserver:3000
  grpc://caudals-orchestration-code:4000
Run scripts/probe-orchestration-stack.sh to verify Dagster health and reference assets.
MSG
