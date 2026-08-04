#!/usr/bin/env bash
set -euo pipefail

# Stores one App runtime credential without putting its value in shell history.
# Run on the VPS; the resulting file is root-only and is the input used to
# create/update the Docker secret.

generated_dir="${CAUDALS_GENERATED_APP_DIR:-/root/.caudals/app}"
credentials_file="$generated_dir/credentials.env"

allowed_keys=(
  DATABASE_URL BETTER_AUTH_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
  RESEND_API_KEY RESEND_FROM_EMAIL CONTACT_NOTIFICATION_EMAIL
  COLLABORATION_NOTIFICATION_EMAIL WAITLIST_NOTIFICATION_EMAIL
  RESEND_PARTNERSHIPS_AUDIENCE_ID RESEND_GENERAL_AUDIENCE_ID
  RESEND_PARTNERSHIPS_SEGMENT_ID RESEND_FALLBACK_FROM_EMAIL
  CALCOM_LINK GOOGLE_SITE_VERIFICATION PUBLIC_SECURITY_REVIEW_ORG_ID
  CAUDALS_TENANT_ORG_ID BETTER_AUTH_URL BETTER_AUTH_TRUSTED_ORIGINS
  BETTER_AUTH_PASSKEY_RP_ID BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS
  OPERATOR_CONSOLE_OPERATOR_ID OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION
  OPERATOR_CONSOLE_SERVICE_ROLE OPERATOR_CONSOLE_DATA_SOURCE
  OPERATOR_CONSOLE_ORG_ID DATABASE_POOL_MAX
)

usage() {
  echo "Usage: $0 <KEY>" >&2
  printf 'Allowed keys:\n' >&2
  printf '  %s\n' "${allowed_keys[@]}" >&2
  exit 1
}

[[ $# -eq 1 ]] || usage
key="$1"
allowed=false
for candidate in "${allowed_keys[@]}"; do
  [[ "$candidate" == "$key" ]] && allowed=true
done
$allowed || usage

mkdir -p "$generated_dir"
chmod 700 "$generated_dir"
touch "$credentials_file"
chmod 600 "$credentials_file"

if [[ -t 0 ]]; then
  read -r -s -p "Value for $key: " value
  echo
else
  IFS= read -r value || [[ -n "${value:-}" ]]
fi
[[ -n "$value" ]] || { echo "Refusing to store an empty value for $key." >&2; exit 1; }
[[ "$value" != *$'\n'* ]] || { echo "Multi-line values are not supported." >&2; exit 1; }

umask 077
temporary="$(mktemp "$generated_dir/.credentials.XXXXXX")"
trap 'rm -f "$temporary"' EXIT
grep -vE "^${key}=" "$credentials_file" >"$temporary" || true
escaped_value=${value//\'/\'\\\'\'}
printf "%s='%s'\n" "$key" "$escaped_value" >>"$temporary"
mv "$temporary" "$credentials_file"
trap - EXIT
echo "Stored $key (${#value} characters) in $credentials_file."
