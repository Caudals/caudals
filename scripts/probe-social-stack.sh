#!/usr/bin/env bash
set -euo pipefail

# Readiness probe for the caudals-social stack. Verifies that Postiz answers on
# the private network, that its Postgres/Redis/Temporal dependencies resolve,
# and that nothing publishes a host port (all ingress must go through Traefik).

STACK_NAME="${CAUDALS_SOCIAL_STACK_NAME:-caudals-social}"
NETWORK="${CAUDALS_SOCIAL_NETWORK:-dokploy-network}"
POSTIZ_SERVICE="${CAUDALS_POSTIZ_SERVICE:-${STACK_NAME}_postiz}"
REDIS_SERVICE="${CAUDALS_SOCIAL_REDIS_SERVICE:-${STACK_NAME}_redis}"
POSTIZ_HOST="${CAUDALS_POSTIZ_HOST:-caudals-social-postiz}"
POSTIZ_PORT="${CAUDALS_POSTIZ_PORT:-5000}"
PUBLIC_HOST="${CAUDALS_POSTIZ_PUBLIC_HOST:-postiz.caudals.com}"
# The Swarm service name is `<stack>_<service>`. `caudals-postgres` alone is
# the stack namespace and the network alias the compose files connect to —
# it matches no `com.docker.swarm.service.name` label, so every lookup below
# came back empty and the deploy died on "No running container found".
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres_db}"
CURL_IMAGE="${CAUDALS_SOCIAL_PROBE_IMAGE:-curlimages/curl:8.11.1}"
PROBE_ATTEMPTS="${CAUDALS_SOCIAL_PROBE_ATTEMPTS:-30}"
PROBE_DELAY="${CAUDALS_SOCIAL_PROBE_DELAY:-10}"

failures=0

ensure_image() {
  if ! docker image inspect "$CURL_IMAGE" >/dev/null 2>&1; then
    docker pull -q "$CURL_IMAGE" >/dev/null
  fi
}

report() {
  printf "%s\t%s\n" "$1" "$2"
}

fail() {
  report "$1" "$2"
  failures=$((failures + 1))
}

# `accept` is a regex over the HTTP status. The public API answers 401 without a
# key, which still proves nginx is routing to the NestJS backend.
probe_http() {
  local name="$1" url="$2" accept="${3:-^[23]}" attempt status

  for attempt in $(seq 1 "$PROBE_ATTEMPTS"); do
    status="$(
      docker run --rm --network "$NETWORK" "$CURL_IMAGE" \
        -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true
    )"

    if [[ "$status" =~ $accept ]]; then
      report "$name" "HTTP $status"
      return 0
    fi

    sleep "$PROBE_DELAY"
  done

  fail "$name" "no acceptable status after $PROBE_ATTEMPTS attempts (last: ${status:-none})"
}

probe_replicas() {
  local name="$1" service="$2" replicas

  replicas="$(docker service ls --filter "name=$service" --format '{{.Replicas}}' | head -n 1)"
  if [[ "$replicas" == 1/1 ]]; then
    report "$name" "$replicas"
  else
    fail "$name" "${replicas:-missing}"
  fi
}

probe_no_published_ports() {
  local name="$1" service="$2" ports

  ports="$(
    docker service inspect "$service" \
      --format '{{range .Endpoint.Ports}}{{.PublishedPort}} {{end}}' 2>/dev/null || true
  )"

  if [[ -n "${ports//[[:space:]]/}" ]]; then
    fail "$name" "$service publishes ports: $ports"
  else
    report "$name" "no published ports"
  fi
}

probe_database() {
  local container

  container="$(
    docker ps --filter "label=com.docker.swarm.service.name=$POSTGRES_SERVICE" \
      --format '{{.Names}}' | head -n 1
  )"

  if [[ -z "$container" ]]; then
    fail "postiz.database" "caudals-postgres container not found"
    return
  fi

  # Postiz runs its Prisma migrations on boot; `Organization` existing means the
  # schema landed successfully.
  if docker exec -i "$container" psql -U caudals_app -d postiz -tAc \
    "SELECT to_regclass('public.\"Organization\"') IS NOT NULL" 2>/dev/null | grep -q '^t$'; then
    report "postiz.database" "schema migrated"
  else
    fail "postiz.database" "Organization table missing (migrations not applied yet)"
  fi
}

probe_public_dns() {
  local resolved
  resolved="$(getent hosts "$PUBLIC_HOST" 2>/dev/null | awk '{print $1}' | head -n 1 || true)"

  if [[ -n "$resolved" ]]; then
    report "postiz.dns" "$PUBLIC_HOST -> $resolved"
  else
    fail "postiz.dns" "$PUBLIC_HOST does not resolve (add the DNS record)"
  fi
}

ensure_image

probe_replicas "redis.replicas" "$REDIS_SERVICE"
probe_replicas "postiz.replicas" "$POSTIZ_SERVICE"
probe_no_published_ports "redis.private" "$REDIS_SERVICE"
probe_no_published_ports "postiz.private" "$POSTIZ_SERVICE"
probe_http "postiz.frontend" "http://$POSTIZ_HOST:$POSTIZ_PORT/"
probe_http "postiz.api" "http://$POSTIZ_HOST:$POSTIZ_PORT/api/public/v1/is-connected" '^(2|3|401|403)'
probe_database
probe_public_dns

if [[ "$failures" -gt 0 ]]; then
  echo "social stack probe failed ($failures check(s))" >&2
  exit 1
fi

echo "social stack probe passed"
