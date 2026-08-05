#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_WORKFLOW_STACK_NAME:-caudals-workflow}"
NETWORK="${CAUDALS_WORKFLOW_NETWORK:-dokploy-network}"
# The Swarm service name is `<stack>_<service>`. `caudals-postgres` alone is
# the stack namespace and the network alias the compose files connect to —
# it matches no `com.docker.swarm.service.name` label, so every lookup below
# came back empty and the deploy died on "No running container found".
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres_db}"
TEMPORAL_IMAGE="${CAUDALS_TEMPORAL_IMAGE:-temporalio/server:1.31.0}"
TEMPORAL_ADMIN_TOOLS_IMAGE="${CAUDALS_TEMPORAL_ADMIN_TOOLS_IMAGE:-temporalio/admin-tools:1.31.0}"
TEMPORAL_UI_IMAGE="${CAUDALS_TEMPORAL_UI_IMAGE:-temporalio/ui:2.49.1}"
TEMPORAL_SECRET="${CAUDALS_TEMPORAL_POSTGRES_SECRET:-temporal_postgres_password}"
TEMPORAL_SECRET_FILE="${CAUDALS_TEMPORAL_POSTGRES_SECRET_FILE:-}"
TEMPORAL_ADDRESS="${CAUDALS_TEMPORAL_ADDRESS:-caudals-workflow-temporal:7233}"
TEMPORAL_NAMESPACE="${CAUDALS_TEMPORAL_NAMESPACE:-caudals-operations}"
TEMPORAL_NAMESPACE_RETENTION="${CAUDALS_TEMPORAL_NAMESPACE_RETENTION:-30d}"
GENERATED_WORKFLOW_DIR="${CAUDALS_GENERATED_WORKFLOW_DIR:-/root/.caudals/workflow}"
GENERATED_TEMPORAL_PASSWORD_FILE="$GENERATED_WORKFLOW_DIR/temporal-postgres-password"
PROBE_ATTEMPTS="${CAUDALS_WORKFLOW_DEPLOY_ATTEMPTS:-30}"

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

ensure_temporal_password_file() {
  if [[ -n "$TEMPORAL_SECRET_FILE" ]]; then
    if [[ ! -r "$TEMPORAL_SECRET_FILE" ]]; then
      echo "Temporal Postgres secret file is not readable: $TEMPORAL_SECRET_FILE" >&2
      exit 1
    fi
    return
  fi

  mkdir -p "$GENERATED_WORKFLOW_DIR"
  chmod 700 "$GENERATED_WORKFLOW_DIR"

  if [[ ! -s "$GENERATED_TEMPORAL_PASSWORD_FILE" ]]; then
    umask 077
    openssl rand -base64 36 >"$GENERATED_TEMPORAL_PASSWORD_FILE"
    echo "Created root-only Temporal Postgres password file: $GENERATED_TEMPORAL_PASSWORD_FILE"
  fi

  TEMPORAL_SECRET_FILE="$GENERATED_TEMPORAL_PASSWORD_FILE"
}

ensure_temporal_secret() {
  if docker secret inspect "$TEMPORAL_SECRET" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$TEMPORAL_SECRET" "$TEMPORAL_SECRET_FILE" >/dev/null
  echo "Created Temporal Postgres Docker secret: $TEMPORAL_SECRET"
}

ensure_temporal_databases() {
  local postgres_container
  local password

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    echo "No running container found for PostgreSQL service: $POSTGRES_SERVICE" >&2
    exit 1
  fi

  password="$(tr -d '\r\n' <"$TEMPORAL_SECRET_FILE")"
  if [[ -z "$password" ]]; then
    echo "Temporal Postgres password file is empty." >&2
    exit 1
  fi

  docker exec -i "$postgres_container" psql \
    -U caudals_app \
    -d caudals \
    -v ON_ERROR_STOP=1 \
    -v temporal_password="$password" <<'SQL' >/dev/null
SELECT set_config('caudals.temporal_password', :'temporal_password', false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'temporal') THEN
    EXECUTE format(
      'CREATE ROLE temporal LOGIN PASSWORD %L',
      current_setting('caudals.temporal_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE temporal WITH LOGIN PASSWORD %L',
      current_setting('caudals.temporal_password')
    );
  END IF;
END;
$$;

SELECT 'CREATE DATABASE temporal OWNER temporal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'temporal')
\gexec

SELECT 'CREATE DATABASE temporal_visibility OWNER temporal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'temporal_visibility')
\gexec

ALTER DATABASE temporal OWNER TO temporal;
ALTER DATABASE temporal_visibility OWNER TO temporal;
ALTER DATABASE temporal SET timezone TO 'UTC';
ALTER DATABASE temporal_visibility SET timezone TO 'UTC';
SQL

  echo "Ensured Temporal PostgreSQL role and databases."
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

schema_initialized() {
  local database="$1"
  local postgres_container

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  docker exec "$postgres_container" psql \
    -U caudals_app \
    -d "$database" \
    -At \
    -c "SELECT CASE WHEN to_regclass('public.schema_version') IS NULL THEN 'false' ELSE 'true' END;" \
    2>/dev/null
}

temporal_sql_tool() {
  local database="$1"
  shift

  local password
  password="$(tr -d '\r\n' <"$TEMPORAL_SECRET_FILE")"

  docker run --rm --network "$NETWORK" \
    -e SQL_PASSWORD="$password" \
    "$TEMPORAL_ADMIN_TOOLS_IMAGE" \
    temporal-sql-tool \
      --plugin postgres12 \
      --endpoint caudals-postgres \
      --port 5432 \
      --user temporal \
      --database "$database" \
      "$@"
}

ensure_temporal_schema() {
  pull_image "$TEMPORAL_ADMIN_TOOLS_IMAGE"

  if [[ "$(schema_initialized temporal)" != "true" ]]; then
    temporal_sql_tool temporal setup-schema -v 0.0 >/dev/null
  fi
  temporal_sql_tool temporal update-schema \
    -d /etc/temporal/schema/postgresql/v12/temporal/versioned >/dev/null

  if [[ "$(schema_initialized temporal_visibility)" != "true" ]]; then
    temporal_sql_tool temporal_visibility setup-schema -v 0.0 >/dev/null
  fi
  temporal_sql_tool temporal_visibility update-schema \
    -d /etc/temporal/schema/postgresql/v12/visibility/versioned >/dev/null

  echo "Ensured Temporal PostgreSQL schemas."
}

wait_for_temporal() {
  local attempt

  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    if docker run --rm --network "$NETWORK" "$TEMPORAL_ADMIN_TOOLS_IMAGE" \
      temporal operator cluster health --address "$TEMPORAL_ADDRESS" >/dev/null 2>&1; then
      echo "Temporal cluster is healthy."
      return 0
    fi

    sleep 5
  done

  echo "Temporal cluster did not become healthy after $PROBE_ATTEMPTS attempts." >&2
  exit 1
}

ensure_temporal_namespace() {
  if docker run --rm --network "$NETWORK" "$TEMPORAL_ADMIN_TOOLS_IMAGE" \
    temporal operator namespace describe \
      --namespace "$TEMPORAL_NAMESPACE" \
      --address "$TEMPORAL_ADDRESS" >/dev/null 2>&1; then
    echo "Temporal namespace exists: $TEMPORAL_NAMESPACE"
    return
  fi

  docker run --rm --network "$NETWORK" "$TEMPORAL_ADMIN_TOOLS_IMAGE" \
    temporal operator namespace create \
      --namespace "$TEMPORAL_NAMESPACE" \
      --retention "$TEMPORAL_NAMESPACE_RETENTION" \
      --description "Caudals durable operations workflows" \
      --address "$TEMPORAL_ADDRESS" >/dev/null

  echo "Created Temporal namespace: $TEMPORAL_NAMESPACE"
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the workflow stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ensure_temporal_password_file
ensure_temporal_secret
ensure_temporal_databases
ensure_temporal_schema

pull_image "$TEMPORAL_IMAGE"
pull_image "$TEMPORAL_UI_IMAGE"

CAUDALS_WORKFLOW_NETWORK="$NETWORK" \
CAUDALS_TEMPORAL_IMAGE="$TEMPORAL_IMAGE" \
CAUDALS_TEMPORAL_UI_IMAGE="$TEMPORAL_UI_IMAGE" \
CAUDALS_TEMPORAL_POSTGRES_SECRET="$TEMPORAL_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/workflow/docker-stack.yml" \
    "$STACK_NAME"

wait_for_temporal
ensure_temporal_namespace

cat <<MSG
Requested workflow stack deployment: $STACK_NAME
Internal Temporal endpoints:
  grpc://caudals-workflow-temporal:7233
  http://caudals-workflow-ui:8080
Namespace:
  $TEMPORAL_NAMESPACE
Run scripts/probe-workflow-stack.sh to verify Temporal health and namespace readiness.
MSG
