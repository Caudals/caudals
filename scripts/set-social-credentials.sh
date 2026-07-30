#!/usr/bin/env bash
set -euo pipefail

# Writes a social provider / AI credential into the root-only Postiz provider
# env file, without ever putting the value on the command line or in shell
# history. Values are read from stdin.
#
#   scripts/set-social-credentials.sh X_API_KEY
#   scripts/set-social-credentials.sh LINKEDIN_CLIENT_SECRET < secret.txt
#
# Run scripts/deploy-social-stack.sh afterwards to roll the new value out.

GENERATED_SOCIAL_DIR="${CAUDALS_GENERATED_SOCIAL_DIR:-/root/.caudals/social}"
PROVIDERS_FILE="$GENERATED_SOCIAL_DIR/providers.env"

ALLOWED_KEYS=(
  X_API_KEY
  X_API_SECRET
  LINKEDIN_CLIENT_ID
  LINKEDIN_CLIENT_SECRET
  OPENAI_API_KEY
)

usage() {
  echo "Usage: $0 <KEY>" >&2
  echo "Allowed keys: ${ALLOWED_KEYS[*]}" >&2
  exit 1
}

[[ $# -eq 1 ]] || usage

KEY="$1"
allowed=false
for candidate in "${ALLOWED_KEYS[@]}"; do
  if [[ "$candidate" == "$KEY" ]]; then
    allowed=true
    break
  fi
done
$allowed || usage

mkdir -p "$GENERATED_SOCIAL_DIR"
chmod 700 "$GENERATED_SOCIAL_DIR"
touch "$PROVIDERS_FILE"
chmod 600 "$PROVIDERS_FILE"

if [[ -t 0 ]]; then
  read -r -s -p "Value for $KEY: " VALUE
  echo
else
  IFS= read -r VALUE
fi

if [[ -z "$VALUE" ]]; then
  echo "Refusing to store an empty value for $KEY." >&2
  exit 1
fi

if [[ "$VALUE" == *$'\n'* ]]; then
  echo "Refusing to store a multi-line value for $KEY." >&2
  exit 1
fi

umask 077
TMP="$(mktemp "$GENERATED_SOCIAL_DIR/.providers.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

grep -vE "^${KEY}=" "$PROVIDERS_FILE" >"$TMP" || true
printf '%s=%s\n' "$KEY" "$VALUE" >>"$TMP"
mv "$TMP" "$PROVIDERS_FILE"
trap - EXIT

echo "Stored $KEY (${#VALUE} characters). Run scripts/deploy-social-stack.sh to apply."
