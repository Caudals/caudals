#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_LAKEHOUSE_STACK_NAME:-caudals-lakehouse}"
NETWORK="${CAUDALS_LAKEHOUSE_NETWORK:-dokploy-network}"
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres}"
LAKEFS_IMAGE="${CAUDALS_LAKEFS_IMAGE:-treeverse/lakefs:1.81.0}"
CURL_IMAGE="${CAUDALS_LAKEHOUSE_CURL_IMAGE:-curlimages/curl:8.11.1}"
LAKEFS_API_URL="${CAUDALS_LAKEFS_API_URL:-http://caudals-lakehouse-lakefs:8000}"
POSTGRES_SECRET="${CAUDALS_LAKEFS_POSTGRES_SECRET:-lakefs_postgres_password}"
AUTH_SECRET="${CAUDALS_LAKEFS_AUTH_ENCRYPT_SECRET:-lakefs_auth_encrypt_secret}"
BLOCKSTORE_SECRET="${CAUDALS_LAKEFS_BLOCKSTORE_SIGNING_SECRET:-lakefs_blockstore_signing_secret}"
POSTGRES_PASSWORD_FILE="${CAUDALS_LAKEFS_POSTGRES_PASSWORD_FILE:-}"
AUTH_SECRET_FILE="${CAUDALS_LAKEFS_AUTH_ENCRYPT_SECRET_FILE:-}"
BLOCKSTORE_SECRET_FILE="${CAUDALS_LAKEFS_BLOCKSTORE_SIGNING_SECRET_FILE:-}"
ADMIN_ACCESS_KEY_FILE="${CAUDALS_LAKEFS_ADMIN_ACCESS_KEY_ID_FILE:-}"
ADMIN_SECRET_KEY_FILE="${CAUDALS_LAKEFS_ADMIN_SECRET_ACCESS_KEY_FILE:-}"
GENERATED_LAKEHOUSE_DIR="${CAUDALS_GENERATED_LAKEHOUSE_DIR:-/root/.caudals/lakehouse}"
GENERATED_POSTGRES_PASSWORD_FILE="$GENERATED_LAKEHOUSE_DIR/lakefs-postgres-password"
GENERATED_AUTH_SECRET_FILE="$GENERATED_LAKEHOUSE_DIR/lakefs-auth-encrypt-secret"
GENERATED_BLOCKSTORE_SECRET_FILE="$GENERATED_LAKEHOUSE_DIR/lakefs-blockstore-signing-secret"
GENERATED_ADMIN_ACCESS_KEY_FILE="$GENERATED_LAKEHOUSE_DIR/lakefs-admin-access-key-id"
GENERATED_ADMIN_SECRET_KEY_FILE="$GENERATED_LAKEHOUSE_DIR/lakefs-admin-secret-access-key"

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

ensure_secret_file() {
  local source_file="$1"
  local generated_file="$2"
  local label="$3"
  local generator="$4"

  if [[ -n "$source_file" ]]; then
    if [[ ! -r "$source_file" ]]; then
      echo "$label file is not readable: $source_file" >&2
      exit 1
    fi
    printf "%s" "$source_file"
    return
  fi

  mkdir -p "$GENERATED_LAKEHOUSE_DIR"
  chmod 700 "$GENERATED_LAKEHOUSE_DIR"

  if [[ ! -s "$generated_file" ]]; then
    umask 077
    eval "$generator" >"$generated_file"
    echo "Created root-only $label file: $generated_file" >&2
  fi

  printf "%s" "$generated_file"
}

ensure_docker_secret() {
  local secret_name="$1"
  local secret_file="$2"
  local label="$3"

  if docker secret inspect "$secret_name" >/dev/null 2>&1; then
    return
  fi

  docker secret create "$secret_name" "$secret_file" >/dev/null
  echo "Created $label Docker secret: $secret_name"
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

ensure_lakefs_database() {
  local postgres_container
  local password

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    echo "No running container found for PostgreSQL service: $POSTGRES_SERVICE" >&2
    exit 1
  fi

  password="$(tr -d '\r\n' <"$POSTGRES_PASSWORD_FILE")"
  if [[ -z "$password" ]]; then
    echo "lakeFS PostgreSQL password file is empty." >&2
    exit 1
  fi

  docker exec -i "$postgres_container" psql \
    -U caudals_app \
    -d caudals \
    -v ON_ERROR_STOP=1 \
    -v lakefs_password="$password" <<'SQL' >/dev/null
SELECT set_config('caudals.lakefs_password', :'lakefs_password', false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lakefs') THEN
    EXECUTE format(
      'CREATE ROLE lakefs LOGIN PASSWORD %L',
      current_setting('caudals.lakefs_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE lakefs WITH LOGIN PASSWORD %L',
      current_setting('caudals.lakefs_password')
    );
  END IF;
END;
$$;

SELECT 'CREATE DATABASE lakefs OWNER lakefs'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'lakefs')
\gexec

ALTER DATABASE lakefs OWNER TO lakefs;
SQL

  echo "Ensured lakeFS PostgreSQL role and database."
}

wait_for_lakefs() {
  local attempt

  for attempt in $(seq 1 24); do
    if docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
      -fsS \
      --connect-timeout 5 \
      --max-time 15 \
      "$LAKEFS_API_URL/_health" >/dev/null 2>&1; then
      return
    fi
    sleep 5
  done

  echo "lakeFS did not become healthy on the private network." >&2
  exit 1
}

ensure_lakefs_setup() {
  local setup_state
  local payload_file
  local status_file
  local access_key
  local secret_key
  local status

  setup_state="$(
    docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
      -fsS \
      --connect-timeout 5 \
      --max-time 15 \
      "$LAKEFS_API_URL/api/v1/setup_lakefs" 2>/dev/null \
      | node -e '
          let input = "";
          process.stdin.on("data", (chunk) => { input += chunk; });
          process.stdin.on("end", () => {
            try {
              process.stdout.write(JSON.parse(input).state ?? "");
            } catch {
              process.exit(1);
            }
          });
        '
  )"

  if [[ "$setup_state" != "not_initialized" ]]; then
    echo "lakeFS setup state: initialized"
    return
  fi

  access_key="$(tr -d '\r\n' <"$ADMIN_ACCESS_KEY_FILE")"
  secret_key="$(tr -d '\r\n' <"$ADMIN_SECRET_KEY_FILE")"
  if [[ -z "$access_key" || -z "$secret_key" ]]; then
    echo "lakeFS admin credential files must not be empty." >&2
    exit 1
  fi

  payload_file="$(mktemp)"
  status_file="$(mktemp)"
  trap 'rm -f "$payload_file" "$status_file"' RETURN

  LAKEFS_ADMIN_ACCESS_KEY_ID="$access_key" \
  LAKEFS_ADMIN_SECRET_ACCESS_KEY="$secret_key" \
    node -e '
    const fs = require("fs");
    const payload = {
      username: "caudals-ops",
      key: {
        access_key_id: process.env.LAKEFS_ADMIN_ACCESS_KEY_ID,
        secret_access_key: process.env.LAKEFS_ADMIN_SECRET_ACCESS_KEY,
      },
    };
    fs.writeFileSync(process.argv[1], JSON.stringify(payload));
  ' "$payload_file"
  chmod 600 "$payload_file"

  status="$(
    docker run \
      --rm \
      --user 0:0 \
      --network "$NETWORK" \
      -v "$payload_file:/tmp/lakefs-setup.json:ro" \
      "$CURL_IMAGE" \
      -sS \
      -o /tmp/lakefs-setup-response.json \
      -w "%{http_code}" \
      --connect-timeout 5 \
      --max-time 20 \
      -H "Content-Type: application/json" \
      --data-binary "@/tmp/lakefs-setup.json" \
      "$LAKEFS_API_URL/api/v1/setup_lakefs" \
      2>"$status_file" || true
  )"

  if [[ "$status" =~ ^20[01]$ ]]; then
    echo "lakeFS initial admin user configured."
    return
  fi

  echo "lakeFS setup API failed with HTTP ${status:-none}." >&2
  if [[ -s "$status_file" ]]; then
    tr "\n" " " <"$status_file" | sed "s/[[:space:]]\\+/ /g" | head -c 240 >&2
    echo >&2
  fi
  exit 1
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the lakehouse stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

POSTGRES_PASSWORD_FILE="$(
  ensure_secret_file \
    "$POSTGRES_PASSWORD_FILE" \
    "$GENERATED_POSTGRES_PASSWORD_FILE" \
    "lakeFS PostgreSQL password" \
    "openssl rand -base64 36"
)"
AUTH_SECRET_FILE="$(
  ensure_secret_file \
    "$AUTH_SECRET_FILE" \
    "$GENERATED_AUTH_SECRET_FILE" \
    "lakeFS auth encryption secret" \
    "openssl rand -hex 32"
)"
BLOCKSTORE_SECRET_FILE="$(
  ensure_secret_file \
    "$BLOCKSTORE_SECRET_FILE" \
    "$GENERATED_BLOCKSTORE_SECRET_FILE" \
    "lakeFS blockstore signing secret" \
    "openssl rand -hex 32"
)"
ADMIN_ACCESS_KEY_FILE="$(
  ensure_secret_file \
    "$ADMIN_ACCESS_KEY_FILE" \
    "$GENERATED_ADMIN_ACCESS_KEY_FILE" \
    "lakeFS admin access key id" \
    "printf AKIA && openssl rand -hex 12 | tr '[:lower:]' '[:upper:]'"
)"
ADMIN_SECRET_KEY_FILE="$(
  ensure_secret_file \
    "$ADMIN_SECRET_KEY_FILE" \
    "$GENERATED_ADMIN_SECRET_KEY_FILE" \
    "lakeFS admin secret access key" \
    "openssl rand -base64 36"
)"

ensure_docker_secret "$POSTGRES_SECRET" "$POSTGRES_PASSWORD_FILE" "lakeFS PostgreSQL password"
ensure_docker_secret "$AUTH_SECRET" "$AUTH_SECRET_FILE" "lakeFS auth encryption"
ensure_docker_secret "$BLOCKSTORE_SECRET" "$BLOCKSTORE_SECRET_FILE" "lakeFS blockstore signing"
ensure_lakefs_database
pull_image "$LAKEFS_IMAGE"
pull_image "$CURL_IMAGE"

CAUDALS_LAKEHOUSE_NETWORK="$NETWORK" \
CAUDALS_LAKEFS_IMAGE="$LAKEFS_IMAGE" \
CAUDALS_LAKEFS_POSTGRES_SECRET="$POSTGRES_SECRET" \
CAUDALS_LAKEFS_AUTH_ENCRYPT_SECRET="$AUTH_SECRET" \
CAUDALS_LAKEFS_BLOCKSTORE_SIGNING_SECRET="$BLOCKSTORE_SECRET" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/lakehouse/docker-stack.yml" \
    "$STACK_NAME"

wait_for_lakefs
ensure_lakefs_setup

cat <<MSG
Requested lakehouse stack deployment: $STACK_NAME
Internal lakeFS endpoint:
  $LAKEFS_API_URL
Run scripts/probe-lakehouse-stack.sh to verify private lakehouse readiness.
MSG
