#!/usr/bin/env bash
set -uo pipefail

APP_SERVICE="${CAUDALS_APP_SERVICE:-caudals-app_app}"
# The Swarm service name is `<stack>_<service>`. `caudals-postgres` alone is
# the stack namespace and the network alias the compose files connect to —
# it matches no `com.docker.swarm.service.name` label, so every lookup below
# came back empty and the deploy died on "No running container found".
POSTGRES_SERVICE="${CAUDALS_POSTGRES_SERVICE:-caudals-postgres_db}"
BASE_URL="${CAUDALS_COMPLETION_BASE_URL:-https://caudals.com}"
CACHE_NETWORK="${CAUDALS_CACHE_NETWORK:-dokploy-network}"
LABELING_NETWORK="${CAUDALS_LABELING_NETWORK:-dokploy-network}"
LAKEHOUSE_NETWORK="${CAUDALS_LAKEHOUSE_NETWORK:-dokploy-network}"
OBSERVABILITY_NETWORK="${CAUDALS_OBSERVABILITY_NETWORK:-dokploy-network}"
ORCHESTRATION_NETWORK="${CAUDALS_ORCHESTRATION_NETWORK:-dokploy-network}"
OPERATIONS_NETWORK="${CAUDALS_OPERATIONS_NETWORK:-dokploy-network}"
VECTOR_NETWORK="${CAUDALS_VECTOR_NETWORK:-dokploy-network}"
WORKFLOW_NETWORK="${CAUDALS_WORKFLOW_NETWORK:-dokploy-network}"
ALERTMANAGER_CONFIG="${CAUDALS_ALERTMANAGER_CONFIG:-infra/observability/alertmanager.yaml}"
ALERTMANAGER_SERVICE="${CAUDALS_ALERTMANAGER_SERVICE:-caudals-observability_alertmanager}"
OBJECT_STORAGE_GATE_ENABLED="${CAUDALS_OBJECT_STORAGE_GATE_ENABLED:-true}"
OBJECT_STORAGE_PROBE_MODE="${CAUDALS_OBJECT_STORAGE_PROBE_MODE:-stack}"
PENTEST_GATE_ENABLED="${CAUDALS_PENTEST_GATE_ENABLED:-false}"
# The legacy dataset-build platform (its eight private stacks, schema,
# intake-channel contracts and G-1..G-7 build evidence) is frozen and no longer
# part of the evaluation product, so it is only checked on request.
LEGACY_STACKS_GATE_ENABLED="${CAUDALS_LEGACY_STACKS_GATE_ENABLED:-false}"

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

# `docker exec` starts from the image's environment, not the one the app's
# start command loads from /run/secrets/app_runtime_env (infra/app-stack.yml).
# App probes therefore replay the live next-server's own environment, so they
# check what the server actually runs with, and a start command that stops
# loading the secret fails them instead of being masked by a probe that
# sources the file itself.
APP_SERVER_ENV_RUNNER='
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const pid = fs.readdirSync("/proc").find((entry) => {
  try {
    return /^\d+$/.test(entry) && fs.readFileSync(`/proc/${entry}/cmdline`, "utf8").startsWith("next-server");
  } catch {
    return false;
  }
});
if (!pid) {
  console.error("no next-server process in the app container");
  process.exit(1);
}
const env = {};
for (const entry of fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")) {
  const separator = entry.indexOf("=");
  if (separator > 0) env[entry.slice(0, separator)] = entry.slice(separator + 1);
}
const [command, ...args] = process.argv.slice(1);
const result = spawnSync(command, args, { env, stdio: "inherit" });
process.exit(result.status ?? 1);
'

app_exec_with_server_env() {
  local app_container="$1"
  shift
  docker exec -i "$app_container" node -e "$APP_SERVER_ENV_RUNNER" -- "$@"
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
  # The public site is the landing page and its funnel; everything else,
  # including the removed marketplace pages and dashboards, must 404.
  local -a allowed=("/" "/contact" "/call" "/blog" "/newsletter" "/equipo")
  local -a blocked=(
    "/about" "/buyer" "/careers" "/catalog" "/catalogue" "/docs" "/pricing"
    "/security" "/supplier" "/v1" "/v1/datasets"
  )

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

  output="$(
    app_exec_with_server_env "$app_container" \
      node scripts/check-sentry-config.mjs --fail-on-disabled </dev/null 2>&1
  )"
  if [[ "$?" -eq 0 ]]; then
    mark_ok "observability.sentry" "$output"
  else
    mark_fail "observability.sentry" "$(printf "%s" "$output" | tr "\n" " " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_app_runtime_config() {
  local app_container="$1"
  local output

  if [[ ! -f "scripts/check-app-runtime-config.mjs" ]]; then
    mark_fail "app.runtime_config" "scripts/check-app-runtime-config.mjs not found"
    return
  fi

  output="$(
    app_exec_with_server_env "$app_container" \
      node --input-type=module - --fail-on-missing \
      < scripts/check-app-runtime-config.mjs 2>&1
  )"
  if [[ "$?" -eq 0 ]]; then
    mark_ok "app.runtime_config" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "app.runtime_config" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_operator_auth_policy() {
  local postgres_container sql output enrollment_env

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    mark_fail "security.operator_auth_policy" "no running container for service $POSTGRES_SERVICE"
    return
  fi

  # Read from the live server, which sees both the service env and the runtime
  # secret; the service spec alone misses a value set in the secret.
  enrollment_env=""
  if [[ -n "$APP_CONTAINER" ]]; then
    enrollment_env="$(
      app_exec_with_server_env "$APP_CONTAINER" node -e \
        'process.stdout.write(process.env.OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT ?? "")' \
        </dev/null 2>/dev/null
    )"
  fi

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

check_legacy_dataset_schema() {
  local postgres_container sql output schema_error

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    mark_fail "legacy.dataset_schema" "no running container for service $POSTGRES_SERVICE"
    return
  fi

  read -r -d "" sql <<'SQL'
WITH required_tables(table_name) AS (
  VALUES
    ('reviewer'),
    ('dataset_partition'),
    ('manifest_artifact'),
    ('payment'),
    ('revenue_share')
),
missing_tables AS (
  SELECT table_name
  FROM required_tables
  WHERE to_regclass(format('public.%I', table_name)) IS NULL
),
modality_constraint AS (
  SELECT pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  WHERE rel.relname = 'modality_contract'
    AND c.conname = 'modality_contract_modality_check'
)
SELECT jsonb_build_object(
  'missing_tables', COALESCE((SELECT jsonb_agg(table_name ORDER BY table_name) FROM missing_tables), '[]'::jsonb),
  'modality_contract_all_types', COALESCE((
    SELECT bool_and(definition ILIKE '%' || modality || '%')
    FROM modality_constraint
    CROSS JOIN (VALUES
      ('tabular'),
      ('text'),
      ('image'),
      ('video'),
      ('audio'),
      ('geospatial'),
      ('document'),
      ('timeseries')
    ) AS required_modalities(modality)
  ), false)
);
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
    mark_fail "legacy.dataset_schema" "$(printf "%s" "$output" | tr "\n" " ")"
    return
  fi

  if schema_error="$(node -e '
    const status = JSON.parse(process.argv[1]);
    if (status.missing_tables.length || !status.modality_contract_all_types) {
      process.stderr.write(JSON.stringify(status));
      process.exit(1);
    }
  ' "$output" 2>&1)"; then
    mark_ok "legacy.dataset_schema" "load-bearing records present and modality_contract accepts all eight modalities"
  else
    mark_fail "legacy.dataset_schema" "$schema_error"
  fi
}

check_legacy_dataset_build() {
  local postgres_container sql output evidence_error

  postgres_container="$(first_service_container "$POSTGRES_SERVICE")"
  if [[ -z "$postgres_container" ]]; then
    mark_fail "legacy.dataset_build" "no running container for service $POSTGRES_SERVICE"
    return
  fi

  read -r -d "" sql <<'SQL'
WITH scope AS (
  SELECT set_config('app.is_service_role', 'true', true)
),
candidates AS (
  SELECT b.id AS build_id, dv.id AS dataset_version_id, b.updated_at
  FROM scope, build b
  JOIN dataset_version dv ON dv.build_id = b.id
  WHERE b.deleted_at IS NULL
    AND dv.deleted_at IS NULL
    AND b.state IN ('released','delivered')
    AND dv.state = 'released'
),
candidate_status AS (
  SELECT
    c.build_id,
    c.dataset_version_id,
    c.updated_at,
    COALESCE((
      SELECT count(DISTINCT ge.gate_key)
      FROM gate_event ge
      WHERE ge.build_id = c.build_id
        AND ge.verdict = 'pass'
    ), 0) AS passing_gates,
    COALESCE((
      SELECT jsonb_agg(layer ORDER BY layer)
      FROM (
        SELECT DISTINCT dp.layer
        FROM dataset_partition dp
        WHERE dp.dataset_version_id = c.dataset_version_id
          AND dp.deleted_at IS NULL
          AND dp.state IN ('sealed','promoted')
      ) layers
    ), '[]'::jsonb) AS partition_layers,
    COALESCE((
      SELECT jsonb_agg(artifact_type ORDER BY artifact_type)
      FROM (
        SELECT DISTINCT ma.artifact_type
        FROM manifest_artifact ma
        WHERE ma.dataset_version_id = c.dataset_version_id
          AND ma.deleted_at IS NULL
          AND ma.state IN ('approved','published')
      ) artifacts
    ), '[]'::jsonb) AS artifact_types,
    EXISTS (
      SELECT 1
      FROM lineage_event le
      WHERE le.dataset_version_id = c.dataset_version_id
    ) AS has_lineage,
    EXISTS (
      SELECT 1
      FROM release_documentation_bundle rd
      WHERE rd.dataset_version_id = c.dataset_version_id
        AND rd.deleted_at IS NULL
        AND rd.state IN ('approved','published')
        AND rd.validation_summary ->> 'status' = 'pass'
        AND rd.package_manifest ? 'croissant'
    ) AS has_release_docs,
    EXISTS (
      SELECT 1
      FROM delivery d
      WHERE d.dataset_version_id = c.dataset_version_id
        AND d.deleted_at IS NULL
        AND d.state = 'accepted'
        AND d.receipt ?& ARRAY[
          'object',
          'acceptedAt',
          'acceptedBy',
          'receiptHash',
          'packageManifestArtifactId'
        ]
    ) AS has_accepted_delivery
  FROM candidates c
)
SELECT jsonb_build_object(
  'candidate_count', (SELECT count(*) FROM candidates),
  'candidates', COALESCE((
    SELECT jsonb_agg(to_jsonb(candidate_status) ORDER BY updated_at DESC, build_id, dataset_version_id)
    FROM candidate_status
  ), '[]'::jsonb)
);
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
    mark_fail "legacy.dataset_build" "$(printf "%s" "$output" | tr "\n" " ")"
    return
  fi

  if evidence_error="$(node -e '
    const payload = JSON.parse(process.argv[1]);
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const requireValues = (label, actual, expected) => {
      const set = new Set(actual ?? []);
      const absent = expected.filter((value) => !set.has(value));
      return absent.length ? `${label}:${absent.join(",")}` : null;
    };
    const missingFor = (status) => {
      const missing = [];

      if (!status.build_id || !status.dataset_version_id) {
        missing.push("released_or_delivered_build");
      }
      if (Number(status.passing_gates ?? 0) < 7) {
        missing.push(`passing_gates:${status.passing_gates ?? 0}/7`);
      }
      for (const missingValue of [
        requireValues("partition_layers", status.partition_layers, [
          "bronze",
          "silver",
          "gold",
        ]),
        requireValues("artifact_types", status.artifact_types, [
          "source_manifest",
          "profile_report",
          "qa_report",
          "package_manifest",
          "croissant",
          "lineage_manifest",
          "privacy_summary",
        ]),
      ]) {
        if (missingValue) missing.push(missingValue);
      }
      if (!status.has_lineage) missing.push("lineage_event");
      if (!status.has_release_docs) missing.push("release_docs");
      if (!status.has_accepted_delivery) missing.push("accepted_delivery");

      return missing;
    };

    const complete = candidates.find((candidate) => missingFor(candidate).length === 0);
    if (complete) {
      process.exit(0);
    }

    const status = candidates[0] ?? {};
    const missing = missingFor(status);
    if (missing.length) {
      process.stderr.write(JSON.stringify({
        missing,
        candidate_count: payload.candidate_count ?? candidates.length,
        status,
      }));
      process.exit(1);
    }
  ' "$output" 2>&1)"; then
    mark_ok "legacy.dataset_build" "build evidence includes G-1..G-7, partitions, artifacts, release docs, lineage, and accepted delivery"
  else
    mark_fail "legacy.dataset_build" "$evidence_error"
  fi
}

check_legacy_intake_channels() {
  local output

  if ! require_command node "legacy.intake_channels"; then
    return
  fi

  if output="$(npm run -s caudals -- intake channels --format json 2>&1)"; then
    if node -e '
      const payload = JSON.parse(process.argv[1]);
      const channels = new Set((payload.channels ?? []).map((channel) => channel.channel));
      const required = [
        "object_storage_share",
        "database_snapshot",
        "api_connector",
        "warehouse_share",
        "public_scraper",
        "sftp",
        "signed_upload_url",
        "email_to_bucket",
        "physical_media",
        "webhook",
      ];
      const missing = required.filter((channel) => !channels.has(channel));
      if (missing.length) {
        process.stderr.write(`missing intake channels: ${missing.join(",")}`);
        process.exit(1);
      }
    ' "$output" 2>/tmp/caudals-legacy-intake-channels.err; then
      mark_ok "legacy.intake_channels" "legacy intake channel contracts present"
    else
      mark_fail "legacy.intake_channels" "$(cat /tmp/caudals-legacy-intake-channels.err 2>/dev/null || printf "%s" "$output")"
    fi
  else
    mark_fail "legacy.intake_channels" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_observability_stack() {
  local output

  if output="$(CAUDALS_OBSERVABILITY_NETWORK="$OBSERVABILITY_NETWORK" scripts/probe-observability-stack.sh 2>&1)"; then
    mark_ok "observability.stack" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "observability.stack" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_cache_stack() {
  local output

  if output="$(CAUDALS_CACHE_NETWORK="$CACHE_NETWORK" scripts/probe-cache-stack.sh 2>&1)"; then
    mark_ok "legacy.cache" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.cache" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_labeling_stack() {
  local output

  if output="$(CAUDALS_LABELING_NETWORK="$LABELING_NETWORK" scripts/probe-labeling-stack.sh 2>&1)"; then
    mark_ok "legacy.labeling" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.labeling" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_cvat_stack() {
  local output

  if output="$(CAUDALS_LABELING_NETWORK="$LABELING_NETWORK" scripts/probe-cvat-stack.sh 2>&1)"; then
    mark_ok "legacy.cvat" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.cvat" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_lakehouse_stack() {
  local output

  if output="$(CAUDALS_LAKEHOUSE_NETWORK="$LAKEHOUSE_NETWORK" scripts/probe-lakehouse-stack.sh 2>&1)"; then
    mark_ok "legacy.lakehouse" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.lakehouse" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_object_storage() {
  local output

  if [[ "$OBJECT_STORAGE_GATE_ENABLED" != "true" ]]; then
    mark_ok "storage.object_store" "probe waived because CAUDALS_OBJECT_STORAGE_GATE_ENABLED is not true"
    return
  fi

  case "$OBJECT_STORAGE_PROBE_MODE" in
    direct)
      if output="$(npm run -s storage:probe 2>&1)"; then
        mark_ok "storage.object_store" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
      else
        mark_fail "storage.object_store" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
      fi
      ;;
    stack)
      if output="$(npm run -s object-storage:probe 2>&1)"; then
        mark_ok "storage.object_store" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
      else
        mark_fail "storage.object_store" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
      fi
      ;;
    *)
      mark_fail "storage.object_store" "unsupported CAUDALS_OBJECT_STORAGE_PROBE_MODE=$OBJECT_STORAGE_PROBE_MODE; expected direct or stack"
      ;;
  esac
}

check_operations_stack() {
  local output

  if output="$(CAUDALS_OPERATIONS_NETWORK="$OPERATIONS_NETWORK" scripts/probe-operations-stack.sh 2>&1)"; then
    mark_ok "legacy.operations" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.operations" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_workflow_stack() {
  local output

  if output="$(CAUDALS_WORKFLOW_NETWORK="$WORKFLOW_NETWORK" scripts/probe-workflow-stack.sh 2>&1)"; then
    mark_ok "legacy.workflow" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.workflow" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_vector_stack() {
  local output

  if output="$(CAUDALS_VECTOR_NETWORK="$VECTOR_NETWORK" scripts/probe-vector-stack.sh 2>&1)"; then
    mark_ok "legacy.vector" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.vector" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_orchestration_stack() {
  local output

  if output="$(CAUDALS_ORCHESTRATION_NETWORK="$ORCHESTRATION_NETWORK" scripts/probe-orchestration-stack.sh 2>&1)"; then
    mark_ok "legacy.orchestration" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  else
    mark_fail "legacy.orchestration" "$(printf "%s" "$output" | tr "\n" "; " | sed "s/[[:space:]]\\+/ /g")"
  fi
}

check_legacy_platform() {
  if [[ "$LEGACY_STACKS_GATE_ENABLED" != "true" ]]; then
    mark_ok "legacy" "legacy stack and dataset-build checks skipped; set CAUDALS_LEGACY_STACKS_GATE_ENABLED=true to require them"
    return
  fi

  check_legacy_dataset_schema
  check_legacy_dataset_build
  check_legacy_intake_channels
  check_cache_stack
  check_labeling_stack
  check_cvat_stack
  check_lakehouse_stack
  check_orchestration_stack
  check_workflow_stack
  check_operations_stack
  check_vector_stack
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
    check_app_runtime_config "$APP_CONTAINER"
  fi

  check_operator_auth_policy
  check_observability_stack
  check_object_storage
  check_alert_routing
  check_tracked_secret_patterns
  check_runtime_secret_env
  check_pentest_tracker
  check_legacy_platform

  if [[ "$failures" -gt 0 ]]; then
    printf "summary\tblocked\t%d completion gate(s) still failing\n" "$failures"
    exit 1
  fi

  printf "summary\tok\tplatform completion gates passed\n"
}

main "$@"
