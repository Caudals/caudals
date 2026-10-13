#!/usr/bin/env bash
# Builds services/connect and deploys it to atlantic as the caudals-connect
# Swarm stack behind dokploy-traefik (connect.caudals.com).
#
#   scripts/deploy-connect.sh
#
# Steps: npm ci, typecheck, build, test; upload a release directory to
# ~/connect-releases/<tag>; build the nginx image there; check its config and
# routes in a throwaway container; roll the service (start-first, automatic
# rollback); install the Traefik route; probe the public site; keep the newest
# CONNECT_KEEP_RELEASES releases and images.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/services/connect"
HOST="${CONNECT_DEPLOY_HOST:-caudals@atlantic}"
STACK="${CONNECT_STACK_NAME:-caudals-connect}"
KEEP="${CONNECT_KEEP_RELEASES:-3}"
PUBLIC_URL="${CONNECT_PUBLIC_URL:-https://connect.caudals.com}"

cd "$APP"
if [[ "${CONNECT_SKIP_INSTALL:-0}" != "1" ]]; then
  npm ci --no-audit --no-fund
fi
npm run typecheck
npm run build
npm test

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$ROOT/infra/connect/Dockerfile" "$ROOT/infra/connect/nginx.conf" "$ROOT/infra/connect/headers.conf" \
  "$ROOT/infra/connect/stack.yml" "$ROOT/infra/connect/traefik.yml" "$STAGE/"
cp -R "$APP/dist" "$STAGE/dist"
find "$STAGE" -name '._*' -delete

HASH="$(cd "$STAGE" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -c1-12)"
TAG="$(date -u +%Y%m%d%H%M)-$HASH"
echo "Release $TAG → $HOST"

COPYFILE_DISABLE=1 tar -C "$STAGE" -czf - --exclude '._*' . |
  ssh -o BatchMode=yes "$HOST" "mkdir -p ~/connect-releases/$TAG && tar -xzf - -C ~/connect-releases/$TAG"

ssh -o BatchMode=yes "$HOST" bash -s -- "$TAG" "$STACK" "$KEEP" <<'REMOTE'
set -euo pipefail
TAG="$1"
STACK="$2"
KEEP="$3"
RELEASE="$HOME/connect-releases/$TAG"
IMAGE="caudals-connect:$TAG"
cd "$RELEASE"

sudo docker build --pull --quiet --label "org.opencontainers.image.revision=$TAG" -t "$IMAGE" . >/dev/null
sudo docker run --rm "$IMAGE" nginx -t

CID="$(sudo docker run -d --read-only --tmpfs /tmp "$IMAGE")"
cleanup() { sudo docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for _ in $(seq 1 20); do
  sudo docker exec "$CID" wget -q -O /dev/null http://127.0.0.1:8080/healthz 2>/dev/null && break
  sleep 0.5
done
check() {
  local path="$1" expect="$2" got
  got="$(sudo docker exec "$CID" sh -c "wget -S --spider 'http://127.0.0.1:8080$path' 2>&1 | awk '/HTTP\\//{print \$2; exit}'")"
  if [[ "$got" != "$expect" ]]; then
    echo "Release check failed: $path returned ${got:-nothing}, expected $expect" >&2
    exit 1
  fi
}
redirects() {
  local path="$1" lang="$2" expect="$3" got
  got="$(sudo docker exec "$CID" sh -c "wget -S --spider --header 'Accept-Language: $lang' 'http://127.0.0.1:8080$path' 2>&1 | awk 'tolower(\$1)==\"location:\"{print \$2; exit}'")"
  if [[ "$got" != "$expect" ]]; then
    echo "Release check failed: $path ($lang) redirected to ${got:-nothing}, expected $expect" >&2
    exit 1
  fi
}
check /healthz 200
check /es/mario/ 200
check /en/alonso/ 200
check /es/setup/ 200
check /es/mario/mario-medrano-paredes.vcf 200
check /sw.js 200
check /mario 302
check /es/mario 301
check /nope 404
redirects /mario es-ES /es/mario/
redirects /alonso/ en-GB /en/alonso/
redirects '/mario?src=nfc' de /en/mario/?src=nfc
redirects / ca /es/
cleanup
trap - EXIT

sudo env CONNECT_IMAGE="$IMAGE" docker stack deploy --detach=false --prune -c stack.yml "$STACK"
sudo install -m 0644 -o root -g root traefik.yml /etc/dokploy/traefik/dynamic/caudals-connect.yml

RUNNING="$(sudo docker service inspect "${STACK}_web" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')"
if [[ "$RUNNING" != "$IMAGE" ]]; then
  echo "Service runs $RUNNING, expected $IMAGE" >&2
  exit 1
fi

# Keep the newest releases and their images; the running one is always kept.
mapfile -t OLD < <(ls -1dt "$HOME"/connect-releases/*/ 2>/dev/null | tail -n +"$((KEEP + 1))")
for dir in "${OLD[@]}"; do
  old_tag="$(basename "$dir")"
  [[ "caudals-connect:$old_tag" == "$RUNNING" ]] && continue
  rm -rf "$dir"
  sudo docker image rm "caudals-connect:$old_tag" >/dev/null 2>&1 || true
done
echo "Deployed $IMAGE"
REMOTE

echo "Probing $PUBLIC_URL"
probe() {
  local path="$1" expect="$2" got
  for _ in $(seq 1 15); do
    got="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Accept-Language: es-ES' "$PUBLIC_URL$path" || true)"
    [[ "$got" == "$expect" ]] && return 0
    sleep 2
  done
  echo "Probe failed: $path returned $got, expected $expect" >&2
  return 1
}
probe /healthz 200
probe /es/mario/ 200
probe /en/alonso/ 200
probe /mario 302
location="$(curl -sS -o /dev/null -w '%{redirect_url}' -H 'Accept-Language: es-ES' "$PUBLIC_URL/mario")"
if [[ "$location" != "$PUBLIC_URL/es/mario/" ]]; then
  echo "Probe failed: /mario redirected to $location" >&2
  exit 1
fi
echo "connect.caudals.com is serving release $TAG"
