#!/usr/bin/env bash
# Temporary, independent webhook receiver for release checks (WP-13).
#
#   sudo scripts/evals/webhook-verifier-service.sh up <secret-file>
#   curl -s https://app.caudals.com/_webhook-verifier/status
#   sudo scripts/evals/webhook-verifier-service.sh down
#
# Runs packages/webhook-verifier/receiver.mjs (no Caudals application code) as
# its own Swarm service with a read-only filesystem, behind a dedicated Traefik
# route. The secret file holds the endpoint secret shown once at creation.
set -euo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run as root on caudals-1" >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
name=caudals-webhook-verifier
route=/etc/dokploy/traefik/dynamic/caudals-webhook-verifier.yml
secret=caudals_webhook_verifier_secret

case "${1:-}" in
  up)
    [[ -s ${2:-} ]] || { echo "usage: $0 up <secret-file>" >&2; exit 2; }
    docker service rm "$name" >/dev/null 2>&1 || true
    docker secret rm "$secret" >/dev/null 2>&1 || true
    docker secret create "$secret" "$2" >/dev/null
    image=$(docker service inspect caudals-evals_worker --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
    install -d -m 755 /opt/caudals-webhook-verifier
    install -m 0644 "$root/packages/webhook-verifier/receiver.mjs" /opt/caudals-webhook-verifier/receiver.mjs
    docker service create --detach=false --quiet --name "$name" --network dokploy-network \
      --secret "source=$secret,target=webhook_secret,uid=1000,mode=0400" \
      --mount type=bind,src=/opt/caudals-webhook-verifier,dst=/verifier,readonly \
      --mount type=tmpfs,dst=/tmp,tmpfs-size=1048576 --read-only --user 1000:1000 \
      --limit-memory 64M --limit-cpu 0.1 \
      -e WEBHOOK_SECRET_FILE=/run/secrets/webhook_secret -e PATH_PREFIX=/_webhook-verifier \
      -e PORT=8080 -e STATE_FILE=/tmp/seen-deliveries.log \
      "$image" node /verifier/receiver.mjs >/dev/null
    cat > "$route" <<'YAML'
# Temporary route for the independent webhook verifier (scripts/evals/webhook-verifier-service.sh).
http:
  routers:
    caudals-webhook-verifier:
      rule: Host(`app.caudals.com`) && PathPrefix(`/_webhook-verifier/`)
      priority: 1000
      service: caudals-webhook-verifier
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    caudals-webhook-verifier:
      loadBalancer:
        servers:
          - url: http://caudals-webhook-verifier:8080
YAML
    echo "verifier up"
    ;;
  down)
    rm -f "$route"
    docker service rm "$name" >/dev/null 2>&1 || true
    docker secret rm "$secret" >/dev/null 2>&1 || true
    rm -rf /opt/caudals-webhook-verifier
    echo "verifier removed"
    ;;
  *) echo "usage: $0 up <secret-file>|down" >&2; exit 2 ;;
esac
