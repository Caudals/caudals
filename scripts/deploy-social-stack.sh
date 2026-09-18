#!/usr/bin/env bash
set -euo pipefail

# Deploys the caudals-social stack (Postiz + a dedicated Redis).
#
# Provisions, idempotently:
#   1. a root-only credential directory under /root/.caudals/social
#   2. the `postiz` PostgreSQL role + database inside caudals-postgres
#   3. the `postiz` Temporal namespace on caudals-workflow-temporal
#   4. the `postiz_env` / `postiz_redis_password` Docker secrets
#   5. the Traefik dynamic route for the public host
#
# Provider credentials (X, LinkedIn, OpenAI) are appended to the env file by
# scripts/set-social-credentials.sh — this script only creates the placeholders
# so the stack boots before those apps exist.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${CAUDALS_SOCIAL_STACK_NAME:-caudals-social}"
NETWORK="${CAUDALS_SOCIAL_NETWORK:-dokploy-network}"
# The Swarm service name is `<stack>_<service>`. `caudals-postgres` alone is
# the stack namespace and the network alias the compose files connect to —
# it matches no `com.docker.swarm.service.name` label, so every lookup below
# came back empty and the deploy died on "No running container found".
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres_db}"
TEMPORAL_SERVICE="${CAUDALS_TEMPORAL_SERVICE:-caudals-workflow_temporal}"
TEMPORAL_ADDRESS="${CAUDALS_POSTIZ_TEMPORAL_ADDRESS:-caudals-workflow-temporal:7233}"
TEMPORAL_NAMESPACE="${CAUDALS_POSTIZ_TEMPORAL_NAMESPACE:-postiz}"
TEMPORAL_ADMIN_IMAGE="${CAUDALS_TEMPORAL_ADMIN_IMAGE:-temporalio/admin-tools:1.28.1-tctl-1.18.4-cli-1.4.1}"
POSTIZ_IMAGE="${CAUDALS_POSTIZ_IMAGE:-ghcr.io/gitroomhq/postiz-app@sha256:785f97312f66a347fb96cdccc4ded5a33ced69a672c89a9adc8054e7d6a21dc5}"
REDIS_IMAGE="${CAUDALS_SOCIAL_REDIS_IMAGE:-redis:7.4.2-alpine}"
PUBLIC_HOST="${CAUDALS_POSTIZ_PUBLIC_HOST:-postiz.caudals.com}"
PUBLIC_URL="${CAUDALS_POSTIZ_PUBLIC_URL:-https://$PUBLIC_HOST}"
ENV_SECRET="${CAUDALS_POSTIZ_ENV_SECRET:-postiz_env}"
REDIS_SECRET="${CAUDALS_POSTIZ_REDIS_SECRET:-postiz_redis_password}"
TRAEFIK_DYNAMIC_DIR="${CAUDALS_TRAEFIK_DYNAMIC_DIR:-/etc/dokploy/traefik/dynamic}"

GENERATED_SOCIAL_DIR="${CAUDALS_GENERATED_SOCIAL_DIR:-/root/.caudals/social}"
POSTGRES_PASSWORD_FILE="$GENERATED_SOCIAL_DIR/postiz-postgres-password"
REDIS_PASSWORD_FILE="$GENERATED_SOCIAL_DIR/postiz-redis-password"
JWT_SECRET_FILE="$GENERATED_SOCIAL_DIR/postiz-jwt-secret"
ENV_FILE="$GENERATED_SOCIAL_DIR/postiz.env"
PROVIDERS_FILE="$GENERATED_SOCIAL_DIR/providers.env"

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

ensure_generated_dir() {
  mkdir -p "$GENERATED_SOCIAL_DIR"
  chmod 700 "$GENERATED_SOCIAL_DIR"
}

# Hex rather than base64 on purpose: these values are interpolated into
# DATABASE_URL and REDIS_URL, and a base64 '/' silently truncates the authority
# so the client falls back to localhost. Hex is URL-safe without escaping.
ensure_random_file() {
  local path="$1"
  local bytes="${2:-32}"

  if [[ ! -s "$path" ]]; then
    umask 077
    openssl rand -hex "$bytes" | tr -d '\r\n' >"$path"
    echo "Created root-only credential file: $path"
  fi
}

# One-time repair for credentials generated before the hex switch.
migrate_unsafe_credential() {
  local path="$1" bytes="${2:-32}"

  if [[ -s "$path" ]] && grep -q '[+/=]' "$path"; then
    umask 077
    openssl rand -hex "$bytes" | tr -d '\r\n' >"$path"
    echo "Regenerated URL-unsafe credential file: $path"
  fi
}

ensure_postiz_database() {
  local postgres_container password

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    echo "No running container found for PostgreSQL service: $POSTGRES_SERVICE" >&2
    exit 1
  fi

  password="$(tr -d '\r\n' <"$POSTGRES_PASSWORD_FILE")"
  if [[ -z "$password" ]]; then
    echo "Postiz PostgreSQL password file is empty." >&2
    exit 1
  fi

  docker exec -i "$postgres_container" psql \
    -U caudals_app \
    -d caudals \
    -v ON_ERROR_STOP=1 \
    -v postiz_password="$password" <<'SQL' >/dev/null
SELECT set_config('caudals.postiz_password', :'postiz_password', false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postiz') THEN
    EXECUTE format(
      'CREATE ROLE postiz LOGIN PASSWORD %L',
      current_setting('caudals.postiz_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE postiz WITH LOGIN PASSWORD %L',
      current_setting('caudals.postiz_password')
    );
  END IF;
END;
$$;

SELECT 'CREATE DATABASE postiz OWNER postiz'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'postiz')
\gexec

ALTER DATABASE postiz OWNER TO postiz;
-- Prisma, the Mastra store and the Temporal orchestrator each hold a pool;
-- at 10 the backend failed with "too many connections for role postiz".
ALTER ROLE postiz CONNECTION LIMIT 30;
ALTER DATABASE postiz SET timezone TO 'UTC';
SQL

  echo "Ensured Postiz PostgreSQL role and database."
}

ensure_temporal_namespace() {
  # Postiz registers the `organizationId` / `postId` custom search attributes on
  # boot, which needs the namespace to already exist. The caudals Temporal image
  # is `temporalio/server` (not auto-setup), so create it with admin-tools.
  if ! docker image inspect "$TEMPORAL_ADMIN_IMAGE" >/dev/null 2>&1; then
    docker pull -q "$TEMPORAL_ADMIN_IMAGE" >/dev/null
  fi

  # The admin-tools image entrypoint is `tini -- sleep infinity`, so the CLI has
  # to be invoked with an explicit --entrypoint or the command is ignored and
  # the container hangs forever.
  local run=(
    docker run --rm --network "$NETWORK"
    --entrypoint temporal
    -e TEMPORAL_ADDRESS="$TEMPORAL_ADDRESS"
    "$TEMPORAL_ADMIN_IMAGE"
    --address "$TEMPORAL_ADDRESS" --command-timeout 30s
  )

  if "${run[@]}" operator namespace describe \
    --namespace "$TEMPORAL_NAMESPACE" >/dev/null 2>&1; then
    echo "Temporal namespace already present: $TEMPORAL_NAMESPACE"
    return
  fi

  "${run[@]}" operator namespace create \
    --namespace "$TEMPORAL_NAMESPACE" \
    --description "Postiz social publishing workflows" \
    --retention 72h >/dev/null

  echo "Created Temporal namespace: $TEMPORAL_NAMESPACE"
}

ensure_env_file() {
  local postgres_password redis_password jwt_secret

  postgres_password="$(tr -d '\r\n' <"$POSTGRES_PASSWORD_FILE")"
  redis_password="$(tr -d '\r\n' <"$REDIS_PASSWORD_FILE")"
  jwt_secret="$(tr -d '\r\n' <"$JWT_SECRET_FILE")"

  # Provider credentials live in their own file so re-running this script never
  # clobbers them. Created empty on first run.
  if [[ ! -f "$PROVIDERS_FILE" ]]; then
    umask 077
    cat >"$PROVIDERS_FILE" <<'EOF'
# Social provider OAuth apps and AI credentials for Postiz.
# Populate with scripts/set-social-credentials.sh, then redeploy this stack.
X_API_KEY=
X_API_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
OPENAI_API_KEY=
EOF
    echo "Created provider credential placeholder file: $PROVIDERS_FILE"
  fi

  umask 077
  {
    echo "# Generated by scripts/deploy-social-stack.sh — do not edit by hand."
    echo "DATABASE_URL=postgresql://postiz:${postgres_password}@caudals-postgres:5432/postiz"
    echo "REDIS_URL=redis://:${redis_password}@caudals-social-redis:6379/0"
    echo "JWT_SECRET=${jwt_secret}"
    grep -vE '^\s*#|^\s*$' "$PROVIDERS_FILE" || true
  } >"$ENV_FILE"
}

# Docker secrets are immutable, so changed content means a new secret. Prints
# the secret name the stack should be deployed against — either the stable one
# (recreated in place) or a timestamped successor when Swarm still holds a
# reference to the old one.
sync_secret() {
  local name="$1" file="$2" digest current_digest

  digest="$(sha256sum "$file" | cut -c1-12)"
  current_digest="$(docker secret inspect "$name" \
    --format '{{index .Spec.Labels "caudals.digest"}}' 2>/dev/null || true)"

  if [[ -n "$current_digest" && "$current_digest" == "$digest" ]]; then
    printf '%s' "$name"
    return
  fi

  if docker secret inspect "$name" >/dev/null 2>&1; then
    if ! docker secret rm "$name" >/dev/null 2>&1; then
      # Still referenced by a running service — park the new value under a
      # timestamped name; the redeploy swaps services over to it.
      name="${name}_$(date -u +%Y%m%dT%H%M%SZ)"
    fi
  fi

  docker secret create --label "caudals.digest=$digest" "$name" "$file" >/dev/null
  echo "Created Docker secret: $name" >&2
  printf '%s' "$name"
}

ensure_traefik_route() {
  local target="$TRAEFIK_DYNAMIC_DIR/caudals-social.yml"

  if [[ ! -d "$TRAEFIK_DYNAMIC_DIR" ]]; then
    echo "Traefik dynamic directory not found: $TRAEFIK_DYNAMIC_DIR — skipping route." >&2
    return
  fi

  cat >"$target" <<EOF
# Managed by scripts/deploy-social-stack.sh
http:
  routers:
    caudals-social-postiz-web:
      rule: Host(\`$PUBLIC_HOST\`)
      service: caudals-social-postiz
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    caudals-social-postiz-websecure:
      rule: Host(\`$PUBLIC_HOST\`)
      service: caudals-social-postiz
      middlewares: []
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt

  services:
    caudals-social-postiz:
      loadBalancer:
        servers:
          - url: http://caudals-social-postiz:5000
        passHostHeader: true
EOF

  echo "Wrote Traefik route for $PUBLIC_HOST"
}

pull_image() {
  local image="$1"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull -q "$image" >/dev/null
  fi
}

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before deploying the social stack." >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Docker network '$NETWORK' does not exist." >&2
  exit 1
fi

ensure_generated_dir
ensure_random_file "$POSTGRES_PASSWORD_FILE" 32
ensure_random_file "$REDIS_PASSWORD_FILE" 32
ensure_random_file "$JWT_SECRET_FILE" 48
migrate_unsafe_credential "$POSTGRES_PASSWORD_FILE" 32
migrate_unsafe_credential "$REDIS_PASSWORD_FILE" 32
ensure_postiz_database
ensure_temporal_namespace
ensure_env_file
REDIS_SECRET="$(sync_secret "$REDIS_SECRET" "$REDIS_PASSWORD_FILE")"
ENV_SECRET="$(sync_secret "$ENV_SECRET" "$ENV_FILE")"
ensure_traefik_route
pull_image "$REDIS_IMAGE"
pull_image "$POSTIZ_IMAGE"

CAUDALS_SOCIAL_NETWORK="$NETWORK" \
CAUDALS_POSTIZ_IMAGE="$POSTIZ_IMAGE" \
CAUDALS_SOCIAL_REDIS_IMAGE="$REDIS_IMAGE" \
CAUDALS_POSTIZ_ENV_SECRET="$ENV_SECRET" \
CAUDALS_POSTIZ_REDIS_SECRET="$REDIS_SECRET" \
CAUDALS_POSTIZ_PUBLIC_URL="$PUBLIC_URL" \
CAUDALS_POSTIZ_TEMPORAL_ADDRESS="$TEMPORAL_ADDRESS" \
CAUDALS_POSTIZ_TEMPORAL_NAMESPACE="$TEMPORAL_NAMESPACE" \
CAUDALS_POSTIZ_DISABLE_REGISTRATION="${CAUDALS_POSTIZ_DISABLE_REGISTRATION:-true}" \
  docker stack deploy \
    --detach=true \
    -c "$ROOT/infra/social/docker-stack.yml" \
    "$STACK_NAME"

cat <<MSG
Requested social stack deployment: $STACK_NAME
Public URL:        $PUBLIC_URL
Internal endpoint: http://caudals-social-postiz:5000
Temporal:          $TEMPORAL_ADDRESS (namespace: $TEMPORAL_NAMESPACE)

Next steps:
  1. Point $PUBLIC_HOST at this host in DNS (A record, DNS-only / not proxied,
     so the Let's Encrypt HTTP challenge can complete).
  2. Registration is closed by default. On a brand-new instance, deploy once
     with CAUDALS_POSTIZ_DISABLE_REGISTRATION=false, sign up, then redeploy.
  3. Add provider credentials with scripts/set-social-credentials.sh and
     redeploy so X and LinkedIn channels can be connected.
  4. Run scripts/probe-social-stack.sh to verify readiness.
MSG
