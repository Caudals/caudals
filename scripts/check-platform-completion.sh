#!/usr/bin/env bash
set -uo pipefail

APP_SERVICE="${CAUDALS_APP_SERVICE:-caudalsdep-caudals-vgbvxp}"
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres}"
BASE_URL="${CAUDALS_COMPLETION_BASE_URL:-https://app.caudals.com}"
OBSERVABILITY_NETWORK="${CAUDALS_OBSERVABILITY_NETWORK:-dokploy-network}"
ALERTMANAGER_CONFIG="${CAUDALS_ALERTMANAGER_CONFIG:-infra/observability/alertmanager.yaml}"
ALERTMANAGER_SERVICE="${CAUDALS_ALERTMANAGER_SERVICE:-caudals-observability_alertmanager}"

failures=0
APP_CONTAINER=""

mark_ok() {
  printf "ok\t%s\t%s\n" "$1" "$2"
}

mark_fail() {
  printf "blocker\t%s\t%s\n" "$1" "$2"
  failures=$((failures + 1))
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    mark_fail "$2" "$1 is not installed or not on PATH"
    return 1
  fi
  return 0
}

first_service_container() {
  docker ps \
    --filter "label=com.docker.swarm.service.name=$1" \
    --format "{{.Names}}" \
    | head -n 1
}

check_deployed_service() {
  local image

  APP_CONTAINER="$(first_service_container "$APP_SERVICE")"
  if [[ -z "$APP_CONTAINER" ]]; then
    mark_fail "deploy.app" "no running container for service $APP_SERVICE"
    return 1
  fi

  image="$(docker inspect --format "{{.Config.Image}}" "$APP_CONTAINER" 2>/dev/null || true)"
  if [[ -z "$image" ]]; then
    mark_fail "deploy.app" "unable to inspect app image for $APP_CONTAINER"
    return 1
  fi

  mark_ok "deploy.app" "$APP_CONTAINER uses $image"
}

check_routes() {
  if ! require_command curl "routing"; then
    return
  fi

  local path status expected
  local -a allowed=("/" "/contact" "/blog")
  local -a blocked=("/catalog" "/catalogue" "/security" "/v1" "/buyer" "/supplier")

  for path in "${allowed[@]}"; do
    status="$(curl -k -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" || true)"
    if [[ "$status" == "200" ]]; then
      mark_ok "routing$path" "returned 200"
    else
      mark_fail "routing$path" "expected 200, got ${status:-none}"
    fi
  done

  status="$(curl -k -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin" || true)"
  if [[ "$status" =~ ^30[12378]$ ]]; then
    mark_ok "routing/admin" "returned $status"
  else
    mark_fail "routing/admin" "expected auth redirect, got ${status:-none}"
  fi

  for path in "${blocked[@]}"; do
    status="$(curl -k -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" || true)"
    expected="404"
    if [[ "$status" == "$expected" ]]; then
      mark_ok "routing$path" "returned 404"
    else
      mark_fail "routing$path" "expected 404, got ${status:-none}"
    fi
  done
}

check_sentry() {
  local app_container="$1"
  local output

  output="$(docker exec "$app_container" sh -lc "node scripts/check-sentry-config.mjs --fail-on-disabled" 2>&1)"
  if [[ "$?" -eq 0 ]]; then
    mark_ok "observability.sentry" "$output"
  else
    mark_fail "observability.sentry" "$(printf "%s" "$output" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_operator_mfa() {
  local postgres_container sql output

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    mark_fail "security.operator_mfa" "no running container for service $POSTGRES_SERVICE"
    return
  fi

  read -r -d "" sql <<'SQL'
WITH operator_status AS (
  SELECT
    ((NOT COALESCE(o.mfa_required, false) OR COALESCE(u."twoFactorEnabled", false))
      AND (NOT COALESCE(o.webauthn_required, false) OR COALESCE(p.passkey_count, 0) > 0)) AS security_complete,
    COALESCE(o.mfa_required, false) AS mfa_required,
    COALESCE(u."twoFactorEnabled", false) AS mfa_enabled,
    COALESCE(o.webauthn_required, false) AS webauthn_required,
    COALESCE(p.passkey_count, 0) > 0 AS has_passkey,
    lower(o.email::text) NOT LIKE '%@caudals.local' AS real_operator
  FROM "operator" o
  LEFT JOIN auth_user u ON u.email = o.email::text
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS passkey_count
    FROM auth_passkey p
    WHERE p."userId" = u.id
  ) p ON true
  WHERE o.deleted_at IS NULL
)
SELECT concat_ws(
  '|',
  count(*)::int,
  count(*) FILTER (WHERE security_complete)::int,
  count(*) FILTER (WHERE NOT security_complete)::int,
  count(*) FILTER (WHERE mfa_enabled)::int,
  count(*) FILTER (WHERE mfa_required)::int,
  count(*) FILTER (WHERE has_passkey)::int,
  count(*) FILTER (WHERE webauthn_required)::int,
  count(*) FILTER (WHERE NOT security_complete AND real_operator)::int
)
FROM operator_status;
SQL

  output="$(
    docker exec "$postgres_container" psql \
      -U caudals_app \
      -d caudals \
      -v ON_ERROR_STOP=1 \
      -At \
      -c "$sql" 2>&1
  )"

  if [[ "$?" -ne 0 ]]; then
    mark_fail "security.operator_mfa" "$(printf "%s" "$output" | tr "\n" " ")"
    return
  fi

  IFS="|" read -r total complete action_needed mfa_enabled mfa_required passkey_users webauthn_required reset_eligible <<<"$output"

  if [[ "$action_needed" == "0" ]]; then
    mark_ok "security.operator_mfa" "total=$total complete=$complete mfa=$mfa_enabled/$mfa_required passkeys=$passkey_users/$webauthn_required"
  else
    mark_fail "security.operator_mfa" "total=$total complete=$complete action_needed=$action_needed mfa=$mfa_enabled/$mfa_required passkeys=$passkey_users/$webauthn_required reset_eligible=$reset_eligible"
  fi
}

check_observability_stack() {
  local output

  output="$(CAUDALS_OBSERVABILITY_NETWORK="$OBSERVABILITY_NETWORK" scripts/probe-observability-stack.sh 2>&1)"
  if [[ "$?" -eq 0 ]]; then
    mark_ok "observability.stack" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "observability.stack" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_alert_routing() {
  local alertmanager_container config_source config_text

  alertmanager_container="$(first_service_container "$ALERTMANAGER_SERVICE")"
  if [[ -n "$alertmanager_container" ]]; then
    config_source="$alertmanager_container:/etc/alertmanager/alertmanager.yml"
    config_text="$(docker exec "$alertmanager_container" cat /etc/alertmanager/alertmanager.yml 2>/dev/null || true)"
  else
    config_source="$ALERTMANAGER_CONFIG"
    if [[ ! -f "$ALERTMANAGER_CONFIG" ]]; then
      mark_fail "observability.alert_routing" "$ALERTMANAGER_CONFIG not found"
      return
    fi
    config_text="$(cat "$ALERTMANAGER_CONFIG")"
  fi

  if grep -Eq "pagerduty_configs|webhook_configs|slack_configs|email_configs|opsgenie_configs|msteams_configs" <<<"$config_text"; then
    mark_ok "observability.alert_routing" "$config_source defines an external receiver"
  else
    mark_fail "observability.alert_routing" "$config_source has only local/no-op receivers"
  fi
}

current_pentest_title() {
  node -e '
    const now = process.env.PENTEST_TRACKER_DATE ? new Date(process.env.PENTEST_TRACKER_DATE) : new Date();
    if (Number.isNaN(now.valueOf())) process.exit(2);
    const year = now.getUTCFullYear();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    process.stdout.write(`Security penetration test - ${year} Q${quarter}`);
  '
}

check_pentest_tracker() {
  if ! require_command gh "security.pentest"; then
    return
  fi

  local title issue number state url
  title="$(current_pentest_title 2>/dev/null || true)"
  if [[ -z "$title" ]]; then
    mark_fail "security.pentest" "unable to calculate current quarter title"
    return
  fi

  issue="$(
    gh issue list \
      --state all \
      --search "$title in:title" \
      --json number,title,state,url \
      --jq ".[] | select(.title == \"$title\") | [.number, .state, .url] | @tsv" \
      --limit 20 2>&1 \
      | head -n 1
  )"

  if [[ -z "$issue" ]]; then
    mark_fail "security.pentest" "no GitHub issue found for '$title'"
    return
  fi

  IFS=$'\t' read -r number state url <<<"$issue"
  if [[ "$state" == "CLOSED" ]]; then
    mark_ok "security.pentest" "#$number closed $url"
  else
    mark_fail "security.pentest" "#$number is $state $url"
  fi
}

main() {
  if ! require_command docker "runtime"; then
    exit 1
  fi

  check_deployed_service

  check_routes

  if [[ -n "$APP_CONTAINER" ]]; then
    check_sentry "$APP_CONTAINER"
  fi

  check_operator_mfa
  check_observability_stack
  check_alert_routing
  check_pentest_tracker

  if [[ "$failures" -gt 0 ]]; then
    printf "summary\tblocked\t%d completion gate(s) still failing\n" "$failures"
    exit 1
  fi

  printf "summary\tok\tplatform completion gates passed\n"
}

main "$@"
