#!/usr/bin/env bash
set -euo pipefail

# Mounts (or rotates) the Sentry DSN on the running web app and evaluation
# workers without a redeploy (launch L-08). The stack files carry the same
# configuration (infra/app-stack.yml, infra/evals/production-stack.yml), so
# the next deploy keeps it; this script is for first enablement and rotation.
#
#   sudo scripts/configure-sentry-runtime.sh
#   sudo CAUDALS_SENTRY_DSN_FILE=/path/to/new-dsn scripts/configure-sentry-runtime.sh
#
# The DSN is read from /root/.caudals/secrets/sentry-dsn by default and is
# never printed. The browser executor has no direct egress and is skipped.

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run with sudo on atlantic." >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="sentry_dsn"
environment="${SENTRY_ENVIRONMENT:-production}"
services=(
  "${CAUDALS_APP_SERVICE:-caudals-app_app}:web"
  "caudals-evals_worker:evals-worker"
  "caudals-evals_scheduler:evals-scheduler"
  "caudals-evals_documents:evals-documents"
)

docker node ls >/dev/null 2>&1 || { echo "Docker Swarm manager access is required." >&2; exit 1; }
secret="$("$root/scripts/sentry-dsn-secret.sh")"

for entry in "${services[@]}"; do
  service="${entry%%:*}"
  name="${entry##*:}"
  if ! docker service inspect "$service" >/dev/null 2>&1; then
    echo "Skipped $service (not running)."
    continue
  fi
  args=(service update --detach=false --quiet)
  while read -r old; do
    [[ -n $old && $old != "$secret" ]] && args+=(--secret-rm "$old")
  done < <(docker service inspect "$service" \
    --format "{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{if eq .File.Name \"$target\"}}{{println .SecretName}}{{end}}{{end}}")
  if ! docker service inspect "$service" \
    --format "{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{println .SecretName}}{{end}}" | grep -qx "$secret"; then
    args+=(--secret-add "source=$secret,target=$target,mode=0444")
  fi
  # A plain SENTRY_DSN would win over the file; never keep one in the service env.
  if docker service inspect "$service" \
    --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | sed 's/=.*//' | grep -qx SENTRY_DSN; then
    args+=(--env-rm SENTRY_DSN)
  fi
  args+=(
    --env-add "SENTRY_DSN_FILE=/run/secrets/$target"
    --env-add "SENTRY_ENVIRONMENT=$environment"
    --env-add "SENTRY_SERVICE=$name"
  )
  [[ -n ${SENTRY_RELEASE:-} ]] && args+=(--env-add "SENTRY_RELEASE=$SENTRY_RELEASE")
  [[ -n ${SENTRY_TRACES_SAMPLE_RATE:-} ]] && args+=(--env-add "SENTRY_TRACES_SAMPLE_RATE=$SENTRY_TRACES_SAMPLE_RATE")
  docker "${args[@]}" "$service" >/dev/null
  echo "Configured Sentry on $service ($name) with secret $secret."
done
echo "Check: sudo docker exec <app container> npm run observability:sentry-status -- --fail-on-disabled"
