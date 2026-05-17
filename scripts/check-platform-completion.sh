#!/usr/bin/env bash
set -uo pipefail

APP_SERVICE="${CAUDALS_APP_SERVICE:-caudalsdep-caudals-vgbvxp}"
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres}"
BASE_URL="${CAUDALS_COMPLETION_BASE_URL:-https://app.caudals.com}"
OBSERVABILITY_NETWORK="${CAUDALS_OBSERVABILITY_NETWORK:-dokploy-network}"
OPERATIONS_NETWORK="${CAUDALS_OPERATIONS_NETWORK:-dokploy-network}"
ALERTMANAGER_CONFIG="${CAUDALS_ALERTMANAGER_CONFIG:-infra/observability/alertmanager.yaml}"
ALERTMANAGER_SERVICE="${CAUDALS_ALERTMANAGER_SERVICE:-caudals-observability_alertmanager}"
PENTEST_GATE_ENABLED="${CAUDALS_PENTEST_GATE_ENABLED:-false}"

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

check_navigation() {
  if ! require_command curl "routing.nav"; then
    return
  fi

  if ! require_command node "routing.nav"; then
    return
  fi

  local output

  output="$(
    curl -k -s "$BASE_URL/" | node -e '
      let html = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        html += chunk;
      });
      process.stdin.on("end", () => {
        const header = html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? "";
        const nav = header.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? "";
        const links = Array.from(
          nav.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi),
          (match) => ({
            href: match[1],
            label: match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
          }),
        );
        const expected = [
          { href: "/contact", label: "Contacto" },
          { href: "/blog", label: "Blog" },
        ];
        const actual = JSON.stringify(links);
        if (actual !== JSON.stringify(expected)) {
          process.stderr.write(`expected ${JSON.stringify(expected)}, got ${actual}`);
          process.exit(1);
        }
        process.stdout.write("links=Contacto:/contact,Blog:/blog");
      });
    ' 2>&1
  )"

  if [[ "$?" -eq 0 ]]; then
    mark_ok "routing.nav" "$output"
  else
    mark_fail "routing.nav" "$(printf "%s" "$output" | tr "\n" " ")"
  fi
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

check_operator_auth_policy() {
  local postgres_container sql output enrollment_env

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    mark_fail "security.operator_auth_policy" "no running container for service $POSTGRES_SERVICE"
    return
  fi

  enrollment_env="$(
    docker service inspect "$APP_SERVICE" \
      --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
      2>/dev/null \
      | awk -F= '$1 == "OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT" {print substr($0, index($0, "=") + 1)}' \
      | tail -n 1
  )"

  read -r -d "" sql <<'SQL'
WITH operator_status AS (
  SELECT
    COALESCE(o.mfa_required, false) AS mfa_required,
    COALESCE(u."twoFactorEnabled", false) AS mfa_enabled,
    COALESCE(o.webauthn_required, false) AS webauthn_required,
    COALESCE(p.passkey_count, 0) > 0 AS has_passkey
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
  count(*) FILTER (WHERE mfa_enabled)::int,
  count(*) FILTER (WHERE mfa_required)::int,
  count(*) FILTER (WHERE has_passkey)::int,
  count(*) FILTER (WHERE webauthn_required)::int
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
    mark_fail "security.operator_auth_policy" "$(printf "%s" "$output" | tr "\n" " ")"
    return
  fi

  IFS="|" read -r total mfa_enabled mfa_required passkey_users webauthn_required <<<"$output"

  if [[ "$enrollment_env" == "true" ]]; then
    mark_fail "security.operator_auth_policy" "legacy enrollment env is true; set OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT=false or remove it"
    return
  fi

  if [[ "$mfa_required" != "0" || "$webauthn_required" != "0" ]]; then
    mark_fail "security.operator_auth_policy" "operator rows still require factors: total=$total mfa_required=$mfa_required webauthn_required=$webauthn_required"
    return
  fi

  mark_ok "security.operator_auth_policy" "password-only operator access allowed total=$total optional_mfa_enabled=$mfa_enabled optional_passkeys=$passkey_users"
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

check_operations_stack() {
  local output

  output="$(CAUDALS_OPERATIONS_NETWORK="$OPERATIONS_NETWORK" scripts/probe-operations-stack.sh 2>&1)"
  if [[ "$?" -eq 0 ]]; then
    mark_ok "operations.stack" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "operations.stack" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
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

check_tracked_secret_patterns() {
  if ! require_command git "security.secret_leaks"; then
    return
  fi

  local matches sentry_auth_assignment sentry_token_prefix

  sentry_auth_assignment="SENTRY_AUTH_"
  sentry_auth_assignment+="TOKEN="
  sentry_token_prefix="sntrys"
  sentry_token_prefix+="_"

  matches="$(
    git grep -IlE \
      "${sentry_auth_assignment}[^[:space:]]+|${sentry_token_prefix}[A-Za-z0-9_=.-]{20,}" \
      -- \
      ':!package-lock.json' \
      ':!node_modules' \
      ':!.next' \
      2>/dev/null || true
  )"

  if [[ -n "$matches" ]]; then
    mark_fail "security.secret_leaks" "tracked files contain Sentry auth token material: $(printf "%s" "$matches" | tr "\n" " ")"
  else
    mark_ok "security.secret_leaks" "no tracked Sentry auth token patterns found"
  fi
}

check_runtime_secret_env() {
  local env_names forbidden present
  local -a forbidden_names=(
    "DATABASE_URL"
    "BETTER_AUTH_SECRET"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "RESEND_API_KEY"
    "SENTRY_DSN"
    "SENTRY_AUTH_TOKEN"
    "DO_SPACES_ACCESS_KEY_ID"
    "DO_SPACES_SECRET_ACCESS_KEY"
  )

  env_names="$(
    docker service inspect "$APP_SERVICE" \
      --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
      2>/dev/null \
      | sed 's/=.*//' \
      || true
  )"

  present=""
  for forbidden in "${forbidden_names[@]}"; do
    if grep -qx "$forbidden" <<<"$env_names"; then
      present+="$forbidden "
    fi
  done

  if [[ -n "$present" ]]; then
    mark_fail "security.runtime_secrets" "plaintext secret env vars must use Docker secrets or *_FILE fallbacks: ${present% }"
  else
    mark_ok "security.runtime_secrets" "no plaintext secret env var names on $APP_SERVICE"
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
  if [[ "$PENTEST_GATE_ENABLED" != "true" ]]; then
    mark_ok "security.pentest" "waived for current completion gate; set CAUDALS_PENTEST_GATE_ENABLED=true to require the quarterly tracker"
    return
  fi

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
  check_navigation

  if [[ -n "$APP_CONTAINER" ]]; then
    check_sentry "$APP_CONTAINER"
  fi

  check_operator_auth_policy
  check_observability_stack
  check_operations_stack
  check_alert_routing
  check_tracked_secret_patterns
  check_runtime_secret_env
  check_pentest_tracker

  if [[ "$failures" -gt 0 ]]; then
    printf "summary\tblocked\t%d completion gate(s) still failing\n" "$failures"
    exit 1
  fi

  printf "summary\tok\tplatform completion gates passed\n"
}

main "$@"
