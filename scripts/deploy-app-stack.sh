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
dataset_signing_key="${CAUDALS_EVALS_DATASET_SIGNING_KEY_FILE:-$state_dir/evals-dataset-signing-key.pem}"
dataset_signing_secret_base="${CAUDALS_EVALS_DATASET_SIGNING_KEY_SECRET:-evals_dataset_signing_key}"
runner_signing_key="${CAUDALS_EVALS_RUNNER_SIGNING_KEY_FILE:-$state_dir/evals-runner-signing-key.pem}"
runner_signing_secret_base="${CAUDALS_EVALS_RUNNER_SIGNING_KEY_SECRET:-evals_runner_signing_key}"
object_storage_access_secret="${CAUDALS_OBJECT_STORAGE_ACCESS_KEY_SECRET:-caudals_object_storage_access_key_id}"
object_storage_secret_secret="${CAUDALS_OBJECT_STORAGE_SECRET_KEY_SECRET:-caudals_object_storage_secret_access_key}"
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

# The service's start command sources this file with sh (infra/app-stack.yml),
# so refuse to ship one that does not load cleanly. Output is discarded because
# shell errors echo fragments of the offending line, which may be a value.
if ! env -i sh -euc 'set -a; . "$1"' sh "$credentials" >/dev/null 2>&1; then
  echo "$credentials does not source cleanly with sh." >&2
  echo "Re-store the offending values with sudo scripts/set-app-credentials.sh KEY" >&2
  exit 1
fi

docker node ls >/dev/null
docker network inspect "$network" >/dev/null
for object_storage_secret in "$object_storage_access_secret" "$object_storage_secret_secret"; do
  if ! docker secret inspect "$object_storage_secret" >/dev/null 2>&1; then
    echo "Missing object-storage Docker secret: $object_storage_secret" >&2
    echo "Run scripts/deploy-object-storage-stack.sh before deploying the app." >&2
    exit 1
  fi
done
for evals_keyring in caudals_evals_webhook_keyring caudals_evals_master_keyring \
  caudals_evals_execution_admin_database_url caudals_evals_dgx_endpoint caudals_evals_browser_session_keyring; do
  if ! docker secret inspect "$evals_keyring" >/dev/null 2>&1; then
    echo "Missing evaluation keyring secret $evals_keyring. Run scripts/provision-evals-production.sh first." >&2
    exit 1
  fi
done

install -d -m 700 "$state_dir"
if [[ ! -s "$dataset_signing_key" ]]; then
  umask 077
  openssl genpkey -algorithm ED25519 -out "$dataset_signing_key" >/dev/null 2>&1
  echo "Created root-only Ed25519 dataset signing key: $dataset_signing_key"
fi
chmod 600 "$dataset_signing_key"
if ! openssl pkey -in "$dataset_signing_key" -noout -text 2>/dev/null | grep -q 'ED25519'; then
  echo "Dataset signing key is not a valid Ed25519 private key: $dataset_signing_key" >&2
  exit 1
fi
if [[ ! -s "$runner_signing_key" ]]; then
  umask 077
  openssl genpkey -algorithm ED25519 -out "$runner_signing_key" >/dev/null 2>&1
  echo "Created root-only Ed25519 runner signing key: $runner_signing_key"
fi
chmod 600 "$runner_signing_key"
if ! openssl pkey -in "$runner_signing_key" -noout -text 2>/dev/null | grep -q 'ED25519'; then
  echo "Runner signing key is not a valid Ed25519 private key: $runner_signing_key" >&2
  exit 1
fi

digest="$(sha256sum "$credentials" | cut -c1-12)"
secret="${secret_base}_${digest}"
if ! docker secret inspect "$secret" >/dev/null 2>&1; then
  docker secret create --label "caudals.digest=$digest" "$secret" "$credentials" >/dev/null
  echo "Created Docker secret: $secret"
fi

dataset_signing_digest="$(sha256sum "$dataset_signing_key" | cut -c1-12)"
dataset_signing_secret="${dataset_signing_secret_base}_${dataset_signing_digest}"
if ! docker secret inspect "$dataset_signing_secret" >/dev/null 2>&1; then
  docker secret create --label "caudals.digest=$dataset_signing_digest" "$dataset_signing_secret" "$dataset_signing_key" >/dev/null
  echo "Created dataset signing Docker secret: $dataset_signing_secret"
fi
runner_signing_digest="$(sha256sum "$runner_signing_key" | cut -c1-12)"
runner_signing_secret="${runner_signing_secret_base}_${runner_signing_digest}"
if ! docker secret inspect "$runner_signing_secret" >/dev/null 2>&1; then
  docker secret create --label "caudals.digest=$runner_signing_digest" "$runner_signing_secret" "$runner_signing_key" >/dev/null
  echo "Created runner signing Docker secret: $runner_signing_secret"
fi

if [[ "$build_local" =~ ^(1|true|yes)$ ]]; then
  docker build --pull -t "$versioned_image" "$root"
  deploy_image="$versioned_image"
else
  # Free space before pulling: the host cleanup removes only images no service
  # runs or would roll back to. It exits non-zero while the disk stays above its
  # warning threshold, which must not block the deploy itself.
  if systemctl list-unit-files caudals-docker-cleanup.service >/dev/null 2>&1; then
    systemctl start caudals-docker-cleanup.service >/dev/null 2>&1 || true
  fi
  docker pull "$versioned_image"
  # A Git commit tag identifies the build, but Swarm must run the registry
  # digest we just pulled so a later tag change cannot alter this release.
  deploy_image="$(docker image inspect "$versioned_image" --format '{{json .RepoDigests}}' |
    jq -r --arg repository "${versioned_image%:*}" 'first(.[] | select(startswith($repository + "@sha256:"))) // empty')"
  if [[ -z "$deploy_image" ]]; then
    echo "The pulled app image has no matching registry digest: $versioned_image" >&2
    exit 1
  fi
fi

CAUDALS_APP_IMAGE="$deploy_image" \
CAUDALS_APP_NETWORK="$network" \
CAUDALS_APP_ENV_SECRET="$secret" \
CAUDALS_EVALS_DATASET_SIGNING_KEY_SECRET="$dataset_signing_secret" \
CAUDALS_EVALS_RUNNER_SIGNING_KEY_SECRET="$runner_signing_secret" \
CAUDALS_OBJECT_STORAGE_ACCESS_KEY_SECRET="$object_storage_access_secret" \
CAUDALS_OBJECT_STORAGE_SECRET_KEY_SECRET="$object_storage_secret_secret" \
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
  "fetch('http://127.0.0.1:3000/', {headers:{host:'app.caudals.com'}}).then(async r=>{if(!r.ok)throw Error(await r.text())}).catch(e=>{console.error(e);process.exit(1)})"

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
      rule: Host(`caudals.com`) || Host(`www.caudals.com`) || Host(`app.caudals.com`)
      service: caudals-app
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    caudals-app-websecure:
      rule: Host(`caudals.com`) || Host(`www.caudals.com`) || Host(`app.caudals.com`)
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
  if curl -fsS https://caudals.com/ >/dev/null && curl -fsS https://app.caudals.com/ >/dev/null; then break; fi
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

echo "Deployed $service with $deploy_image (build $versioned_image)"
echo "Legacy Traefik routes retained for rollback in $route_backup"
