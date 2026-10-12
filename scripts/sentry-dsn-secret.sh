#!/usr/bin/env bash
# Prints the name of the versioned Docker secret holding the Sentry DSN,
# creating it from the root-only DSN file when needed (launch L-08). Secrets
# are immutable, so the name carries a hash of the value: a rotated DSN gets a
# new secret and the next deploy switches to it. The DSN is never printed.
#
# Used by scripts/deploy-app-stack.sh, scripts/deploy-evals-production.sh and
# scripts/configure-sentry-runtime.sh. Without the DSN file it reuses the
# newest existing caudals_sentry_dsn_* secret; with neither it fails.
set -euo pipefail

dsn_file="${CAUDALS_SENTRY_DSN_FILE:-/root/.caudals/secrets/sentry-dsn}"
base="${CAUDALS_SENTRY_SECRET_BASE:-caudals_sentry_dsn}"

if [[ -r $dsn_file && -s $dsn_file ]]; then
  dsn="$(tr -d '\r\n' <"$dsn_file")"
  if ! SENTRY_DSN="$dsn" node -e '
    try {
      const url = new URL(process.env.SENTRY_DSN || "");
      process.exit(url.protocol === "https:" && url.host && url.username && /^\/\d+$/.test(url.pathname) ? 0 : 1);
    } catch { process.exit(1); }'; then
    echo "The Sentry DSN in $dsn_file failed validation (https, public key, numeric project)." >&2
    exit 1
  fi
  secret="${base}_$(printf '%s' "$dsn" | sha256sum | cut -c1-12)"
  if ! docker secret inspect "$secret" >/dev/null 2>&1; then
    printf '%s' "$dsn" | docker secret create --label "caudals.purpose=sentry-dsn" "$secret" - >/dev/null
  fi
  unset dsn
  echo "$secret"
  exit 0
fi

latest="$(docker secret ls --filter "name=${base}_" --format '{{.CreatedAt}}|{{.Name}}' | sort -r | head -n1 | cut -d'|' -f2)"
if [[ -n $latest ]]; then
  echo "$latest"
  exit 0
fi
echo "No Sentry DSN: put it in $dsn_file (root-only, mode 600)." >&2
exit 1
