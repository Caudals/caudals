#!/usr/bin/env bash
set -euo pipefail

# Static public contact cards. No application/database deployment is involved.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
test -f services/connect/dist/release.json || { echo 'Run npm --prefix services/connect run build first.' >&2; exit 1; }
release="$(node -e "const fs=require('fs'),c=require('crypto');const h=c.createHash('sha256');for(const p of ['services/connect/dist/release.json','infra/connect/Dockerfile','infra/connect/nginx.conf','infra/connect/stack.yml','infra/connect/traefik.yml'])h.update(fs.readFileSync(p));console.log(h.digest('hex').slice(0,16))")"
remote_dir="/home/caudals/connect-releases/$release"
ssh caudals@atlantic "mkdir -p '$remote_dir'"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - services/connect/dist infra/connect | ssh caudals@atlantic "tar -xzf - -C '$remote_dir'"
ssh caudals@atlantic bash -s -- "$remote_dir" "$release" <<'REMOTE'
set -euo pipefail
cd "$1"
image="caudals-connect:$2"
sudo docker build -f infra/connect/Dockerfile -t "$image" .
sudo docker run --rm --entrypoint nginx "$image" -t
sudo env CAUDALS_CONNECT_IMAGE="$image" docker stack deploy --resolve-image never -c infra/connect/stack.yml caudals-connect
ready=false
for attempt in $(seq 1 60); do
  replicas="$(sudo docker service ls --filter name=caudals-connect_web --format '{{.Replicas}}')"
  state="$(sudo docker service inspect caudals-connect_web --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{end}}')"
  healthy="$(sudo docker ps --filter label=com.docker.swarm.service.name=caudals-connect_web --filter ancestor="$image" --filter health=healthy --format '{{.ID}}')"
  if [ "$replicas" = '1/1' ] && [ -n "$healthy" ] && { [ -z "$state" ] || [ "$state" = completed ]; }; then ready=true; break; fi
  case "$state" in paused|rollback*) echo "Deployment failed: $state" >&2; exit 1;; esac
  sleep 2
done
test "$ready" = true
sudo install -m 644 infra/connect/traefik.yml /etc/dokploy/traefik/dynamic/caudals-connect.yml.tmp
sudo mv /etc/dokploy/traefik/dynamic/caudals-connect.yml.tmp /etc/dokploy/traefik/dynamic/caudals-connect.yml
sudo docker service ls --filter name=caudals-connect_web --format '{{.Name}} {{.Image}} {{.Replicas}}'
REMOTE
printf 'Deployed release %s from %s\n' "$release" "$remote_dir"
printf 'Verify https://connect.caudals.com/es/mario and /es/alonso, then run CONNECT_BASE_URL=https://connect.caudals.com npm --prefix services/connect test\n'
