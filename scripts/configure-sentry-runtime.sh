#!/usr/bin/env bash
set -euo pipefail

APP_SERVICE="${CAUDALS_APP_SERVICE:-caudalsdep-caudals-vgbvxp}"
SECRET_BASE_NAME="${CAUDALS_SENTRY_SECRET_NAME:-caudals_sentry_dsn}"
SECRET_TARGET="${CAUDALS_SENTRY_SECRET_TARGET:-caudals_sentry_dsn}"
SECRET_FILE_PATH="/run/secrets/$SECRET_TARGET"
SENTRY_DSN_INPUT_FILE="${CAUDALS_SENTRY_DSN_FILE:-}"
SENTRY_DSN_INPUT="${SENTRY_DSN:-}"
SENTRY_ENVIRONMENT_VALUE="${SENTRY_ENVIRONMENT:-production}"
SENTRY_TRACES_SAMPLE_RATE_VALUE="${SENTRY_TRACES_SAMPLE_RATE:-0}"
SENTRY_PROFILES_SAMPLE_RATE_VALUE="${SENTRY_PROFILES_SAMPLE_RATE:-0}"
SENTRY_RELEASE_VALUE="${SENTRY_RELEASE:-${CAUDALS_SENTRY_RELEASE:-}}"

if ! docker node ls >/dev/null 2>&1; then
  echo "Docker Swarm manager access is required before configuring Sentry runtime." >&2
  exit 1
fi

if ! docker service inspect "$APP_SERVICE" >/dev/null 2>&1; then
  echo "Docker service does not exist: $APP_SERVICE" >&2
  exit 1
fi

if [[ -n "$SENTRY_DSN_INPUT_FILE" ]]; then
  if [[ ! -r "$SENTRY_DSN_INPUT_FILE" ]]; then
    echo "Sentry DSN file is not readable: $SENTRY_DSN_INPUT_FILE" >&2
    exit 1
  fi
  SENTRY_DSN_INPUT="$(tr -d '\r\n' <"$SENTRY_DSN_INPUT_FILE")"
fi

validate_dsn() {
  local dsn="$1"

  SENTRY_DSN="$dsn" node -e '
    const value = process.env.SENTRY_DSN || "";
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || !url.host || !url.username) {
        process.exit(1);
      }
    } catch {
      process.exit(1);
    }
  '
}

service_env_names() {
  docker service inspect "$APP_SERVICE" \
    --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
    | sed 's/=.*//'
}

existing_secret_for_target() {
  docker service inspect "$APP_SERVICE" \
    --format "{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{if eq .File.Name \"$SECRET_TARGET\"}}{{println .SecretName}}{{end}}{{end}}"
}

if [[ -z "$SENTRY_RELEASE_VALUE" ]]; then
  SENTRY_RELEASE_VALUE="$(git rev-parse HEAD 2>/dev/null || true)"
fi

if [[ -z "$SENTRY_RELEASE_VALUE" ]]; then
  SENTRY_RELEASE_VALUE="$(
    docker service inspect "$APP_SERVICE" \
      --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
  )"
fi

secret_name="$SECRET_BASE_NAME"
created_secret=false

if [[ -n "$SENTRY_DSN_INPUT" ]]; then
  if ! validate_dsn "$SENTRY_DSN_INPUT"; then
    echo "Sentry DSN value failed basic URL validation." >&2
    exit 1
  fi

  secret_name="${SECRET_BASE_NAME}_$(date -u +%Y%m%d%H%M%S)"
  printf "%s" "$SENTRY_DSN_INPUT" | docker secret create "$secret_name" - >/dev/null
  created_secret=true
elif ! docker secret inspect "$secret_name" >/dev/null 2>&1; then
  cat >&2 <<MSG
No Sentry DSN was provided and Docker secret '$secret_name' does not exist.
Set CAUDALS_SENTRY_DSN_FILE to a local file containing the DSN, or set SENTRY_DSN
for this command only. The DSN will not be printed.
MSG
  exit 1
fi

mapfile -t old_target_secrets < <(existing_secret_for_target)
mapfile -t env_names < <(service_env_names)
update_args=(service update --detach=false)

for old_secret in "${old_target_secrets[@]}"; do
  if [[ -n "$old_secret" ]]; then
    update_args+=(--secret-rm "$old_secret")
  fi
done

update_args+=(
  --secret-add "source=$secret_name,target=$SECRET_TARGET,mode=0400"
)

if printf "%s\n" "${env_names[@]}" | grep -qx "SENTRY_DSN"; then
  update_args+=(--env-rm SENTRY_DSN)
fi

update_args+=(
  --env-add "SENTRY_DSN_FILE=$SECRET_FILE_PATH"
  --env-add "SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT_VALUE"
  --env-add "SENTRY_RELEASE=$SENTRY_RELEASE_VALUE"
  --env-add "SENTRY_TRACES_SAMPLE_RATE=$SENTRY_TRACES_SAMPLE_RATE_VALUE"
  --env-add "SENTRY_PROFILES_SAMPLE_RATE=$SENTRY_PROFILES_SAMPLE_RATE_VALUE"
  "$APP_SERVICE"
)

docker "${update_args[@]}"

if [[ "$created_secret" == "true" ]]; then
  echo "Created and mounted Sentry Docker secret: $secret_name"
else
  echo "Mounted existing Sentry Docker secret: $secret_name"
fi
echo "Configured Sentry runtime via SENTRY_DSN_FILE=$SECRET_FILE_PATH"
