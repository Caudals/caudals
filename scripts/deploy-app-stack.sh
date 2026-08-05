#!/usr/bin/env bash
set -euo pipefail

# Builds and deploys the Caudals App as a secret-backed Swarm stack. The first cutover
# keeps the old Dokploy application running but removes its routers, so rollback
# is an atomic Traefik file swap instead of a database restore.

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run with sudo on caudals-1." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stack="${CAUDALS_APP_STACK_NAME:-caudals-app}"
network="${CAUDALS_APP_NETWORK:-dokploy-network}"
base_image="${CAUDALS_APP_IMAGE:-mariomedpar/caudals:latest}"
build_local="${CAUDALS_APP_BUILD_LOCAL:-true}"
build_tag="${CAUDALS_APP_BUILD_TAG:-$(git -C "$root" rev-parse HEAD)}"
versioned_image="${base_image%:*}:$build_tag"
state_dir="${CAUDALS_APP_STATE_DIR:-/root/.caudals/app}"
credentials="$state_dir/credentials.env"
secret_base="${CAUDALS_APP_ENV_SECRET:-app_runtime_env}"
traefik_dir="${CAUDALS_TRAEFIK_DYNAMIC_DIR:-/etc/dokploy/traefik/dynamic}"
backup_root="${CAUDALS_APP_BACKUP_DIR:-/root/.caudals/backups}"

required=(
  NEXT_PUBLIC_APP_URL
)
missing=()
for key in "${required[@]}"; do
  grep -qE "^${key}=.+" "$credentials" 2>/dev/null || missing+=("$key")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing production credentials: ${missing[*]}" >&2
  echo "Store each with sudo scripts/set-app-credentials.sh KEY" >&2
  exit 1
fi

docker node ls >/dev/null
docker network inspect "$network" >/dev/null

digest="$(sha256sum "$credentials" | cut -c1-12)"
secret="${secret_base}_${digest}"
if ! docker secret inspect "$secret" >/dev/null 2>&1; then
  docker secret create --label "caudals.digest=$digest" "$secret" "$credentials" >/dev/null
  echo "Created Docker secret: $secret"
fi

if [[ "$build_local" =~ ^(1|true|yes)$ ]]; then
  docker build --pull -t "$versioned_image" "$root"
else
  docker pull "$versioned_image"
fi

CAUDALS_APP_IMAGE="$versioned_image" \
CAUDALS_APP_NETWORK="$network" \
CAUDALS_APP_ENV_SECRET="$secret" \
  docker stack deploy --detach=true -c "$root/infra/app-stack.yml" "$stack"

service="${stack}_app"
for attempt in $(seq 1 60); do
  status="$(docker service inspect "$service" --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{else}}created{{end}}' 2>/dev/null || true)"
  running="$(docker service ps "$service" --filter desired-state=running --format '{{.CurrentState}}' 2>/dev/null | grep -c '^Running' || true)"
  [[ "$running" -ge 1 && "$status" != paused && "$status" != rollback_paused ]] && break
  if [[ "$attempt" -eq 60 ]]; then
    docker service ps "$service" --no-trunc >&2
    docker service logs "$service" --raw --tail 100 >&2 || true
    exit 1
  fi
  sleep 2
done

container="$(docker ps --filter "label=com.docker.swarm.service.name=$service" --format '{{.ID}}' | head -n1)"
docker exec "$container" node -e \
  "fetch('http://127.0.0.1:3000/').then(async r=>{if(!r.ok)throw Error(await r.text())}).catch(e=>{console.error(e);process.exit(1)})"

install -d -m 700 "$backup_root"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
route_backup="$backup_root/app-traefik-$stamp"
install -d -m 700 "$route_backup"
legacy_service="${CAUDALS_APP_LEGACY_SERVICE:-caudals-caudals-bce943}"
if docker service inspect "$legacy_service" >/dev/null 2>&1; then
  docker service inspect "$legacy_service" >"$route_backup/legacy-service.json"
  chmod 600 "$route_backup/legacy-service.json"
fi
for legacy in caudals-app.yml caudals-caudals-bce943.yml caudals-dokploy-webhook.yml; do
  if [[ -f "$traefik_dir/$legacy" ]]; then
    mv "$traefik_dir/$legacy" "$route_backup/$legacy"
  fi
done

route_tmp="$(mktemp "$traefik_dir/.caudals-app.XXXXXX")"
trap 'rm -f "$route_tmp"' EXIT
cat >"$route_tmp" <<'EOF'
# Managed by /home/caudals/caudals/scripts/deploy-app-stack.sh
http:
  routers:
    caudals-app-web:
      rule: Host(`caudals.com`) || Host(`www.caudals.com`)
      service: caudals-app
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    caudals-app-websecure:
      rule: Host(`caudals.com`) || Host(`www.caudals.com`)
      service: caudals-app
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    caudals-app:
      loadBalancer:
        servers:
          - url: http://caudals-app:3000
        passHostHeader: true
EOF
chmod 600 "$route_tmp"
mv "$route_tmp" "$traefik_dir/caudals-app.yml"
trap - EXIT

for attempt in $(seq 1 30); do
  if curl -fsS https://caudals.com/ >/dev/null; then break; fi
  if [[ "$attempt" -eq 30 ]]; then
    mv "$traefik_dir/caudals-app.yml" "$route_backup/failed-caudals-app.yml"
    for previous in caudals-app.yml caudals-caudals-bce943.yml caudals-dokploy-webhook.yml; do
      if [[ -f "$route_backup/$previous" ]]; then
        mv "$route_backup/$previous" "$traefik_dir/$previous"
      fi
    done
    echo "Public health failed; previous Traefik routes were restored." >&2
    exit 1
  fi
  sleep 2
done

echo "Deployed $service with $versioned_image"
echo "Legacy Traefik routes retained for rollback in $route_backup"
