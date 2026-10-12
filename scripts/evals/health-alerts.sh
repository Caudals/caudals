#!/usr/bin/env bash
# Operational alerts for atlantic (spec §17.6, launch L-08 / P-48), run by
# caudals-evals-health.timer. Checks host pressure, Swarm convergence, DGX
# reachability, backup age and evaluation signals (stuck queue, expired leases,
# unresolved paid attempts, unhealthy providers, budget pauses, failed report
# rendering), plus the launch signals: demo failure rate, demo and engine
# queue age, webhook failures, credit holds unresolved for 24 hours and a
# daily shadow credit report with mismatches (L-11). Each
# alert is emailed once when it opens, repeated at most daily while open, and
# once when it resolves, with a link to its runbook. Messages carry counts and
# names only: no prompts, customer content, secrets or private endpoints.
#
# Drill (docs/evals/runbooks.md, "Alert drills"): CAUDALS_ALERT_DRILL=all, or a
# comma-separated list of alert keys, opens those alerts marked [drill] without
# evaluating them; the next ordinary run resolves them.
set -euo pipefail

host_checks="${CAUDALS_ALERT_HOST_CHECKS:-true}"
if [[ $host_checks == true ]]; then
  [[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run as root on atlantic" >&2; exit 1; }
fi
state_dir="${CAUDALS_ALERT_STATE_DIR:-/root/.caudals/evals-production/alerts}"
credentials="${CAUDALS_APP_CREDENTIALS:-/root/.caudals/app/credentials.env}"
dgx_endpoint_file="${CAUDALS_DGX_ENDPOINT_FILE:-/root/.caudals/evals-production/dgx-endpoint}"
backup_dir="${CAUDALS_BACKUP_DIR:-/root/.caudals/backups}"
dry_run="${CAUDALS_ALERT_DRY_RUN:-false}"
drill="${CAUDALS_ALERT_DRILL:-}"
runbooks="${CAUDALS_RUNBOOK_URL:-https://github.com/Caudals/caudals/blob/main/docs/evals/runbooks.md}"
queue_database="${CAUDALS_ALERT_QUEUE_DATABASE:-caudals_evals_queue}"
queue_schema="${CAUDALS_ALERT_QUEUE_SCHEMA:-evals_queue_prod}"
demo_failure_percent="${CAUDALS_ALERT_DEMO_FAILURE_PERCENT:-20}"
demo_min_runs="${CAUDALS_ALERT_DEMO_MIN_RUNS:-3}"
queue_minutes="${CAUDALS_ALERT_QUEUE_MINUTES:-15}"
install -d -m 700 "$state_dir"

# SQL runs as the database owner, aggregates only. Tests point it elsewhere
# with CAUDALS_ALERT_PSQL (a psql command that takes -d <database> and -c).
if [[ -n ${CAUDALS_ALERT_PSQL:-} ]]; then
  read -r -a psql_cmd <<<"$CAUDALS_ALERT_PSQL"
else
  pg=$(docker ps -q -f name=caudals-postgres_db | head -n1)
  psql_cmd=()
  [[ -n $pg ]] && psql_cmd=(docker exec "$pg" psql -U postgres)
fi
sql() { "${psql_cmd[@]}" -d "$1" -X -AtF ' ' -c "$2"; }

declare -A open=()
flag() { open["$1"]="$2"; }

# Each alert key has a runbook section (anchors in docs/evals/runbooks.md).
runbook_for() {
  case $1 in
    disk_pressure|memory_pressure) echo "$runbooks#11-disk-or-memory-pressure" ;;
    service_*) echo "$runbooks#12-service-not-converged" ;;
    dgx_unreachable|provider_unhealthy) echo "$runbooks#1-dgx-down" ;;
    backup_missing|backup_stale) echo "$runbooks#9-backup-restore" ;;
    queue_stuck|lease_expired|engine_queue_stale) echo "$runbooks#13-queue-age" ;;
    unresolved_attempts) echo "$runbooks#4-worker-crash-mid-call" ;;
    budget_pauses) echo "$runbooks#5-budget-mismatch" ;;
    report_render_failed) echo "$runbooks#14-report-rendering-failed" ;;
    demo_failure_rate|demo_queue_stale) echo "$runbooks#15-demo-failures-or-queue" ;;
    webhook_failures) echo "$runbooks#16-webhook-failures" ;;
    holds_stale|billing_shadow_drift) echo "$runbooks#17-billing-incident" ;;
    database_down|database_unreadable) echo "$runbooks#18-database-unreachable" ;;
    *) echo "$runbooks" ;;
  esac
}

if [[ $host_checks == true ]]; then
  # Host pressure.
  disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
  (( disk >= ${CAUDALS_ALERT_DISK_PERCENT:-85} )) && flag disk_pressure "Root disk is ${disk}% used."
  mem_avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  (( mem_avail < ${CAUDALS_ALERT_MEM_MB:-400} )) && flag memory_pressure "Only ${mem_avail} MiB of memory is available."

  # Swarm convergence.
  while IFS='|' read -r name replicas; do
    current=${replicas%%/*}; desired=${replicas##*/}; desired=${desired%% *}
    [[ $current == "$desired" ]] || flag "service_${name}" "Service ${name} is at ${replicas}."
  done < <(docker service ls --format '{{.Name}}|{{.Replicas}}')

  # DGX reachability from the host's private route (address never included).
  if [[ -s $dgx_endpoint_file ]]; then
    code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$(tr -d '\n' < "$dgx_endpoint_file")/models" || true)
    [[ $code == 200 ]] || flag dgx_unreachable "The DGX inference route did not answer (HTTP ${code:-none})."
  fi

  # Backup age.
  latest=$(find "$backup_dir" -maxdepth 1 -name 'caudals-daily-*.tar.gz.gpg' -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
  if [[ -z $latest ]]; then
    flag backup_missing "No daily encrypted backup exists yet."
  elif (( $(date +%s) - ${latest%.*} > 26 * 3600 )); then
    flag backup_stale "The newest daily backup is older than 26 hours."
  fi
fi

# A table that may not exist yet (billing.stripe_event arrives with L-12) is
# read through query_to_xml, so its absence is a zero and never a SQL error.
optional_count() { # <regclass> <required columns, comma-separated> <query returning column c>
  local query=${3//\'/\'\'} columns
  IFS=, read -r -a columns <<<"$2"
  printf "CASE WHEN to_regclass('%s') IS NOT NULL AND (SELECT count(*) FROM information_schema.columns WHERE table_schema||'.'||table_name='%s' AND column_name = ANY(string_to_array('%s', ',')))=%d THEN (xpath('/row/c/text()', query_to_xml('%s', false, true, '')))[1]::text::int ELSE 0 END" "$1" "$1" "$2" "${#columns[@]}" "$query"
}

# Evaluation signals (aggregates only, across tenants, as the database owner).
if (( ${#psql_cmd[@]} )); then
  read -r stuck expired unknown providers budget renders < <(sql caudals "
    SELECT
      (SELECT count(*) FROM evals.outbox_event WHERE delivered_at IS NULL AND available_at < now()-interval '15 minutes'),
      (SELECT count(*) FROM evals.workflow_step WHERE status='running' AND lease_until < now()-interval '10 minutes'),
      -- An unknown outcome stays on the attempt as history; only unsettled liability needs action.
      (SELECT count(*) FROM evals.execution_attempt a WHERE a.status='unknown' AND NOT EXISTS (
        SELECT 1 FROM evals.budget_reservation r WHERE r.org_id=a.org_id AND r.attempt_id=a.id AND r.state IN ('settled','released')))
        + (SELECT count(*) FROM evals.target_invocation_call WHERE state='unknown' AND dispatched_at > now()-interval '7 days'),
      (SELECT count(*) FROM evals.provider_health h JOIN evals.provider_revision p ON p.id=h.provider_revision_id
        WHERE h.state NOT IN ('healthy','unprobed') AND (p.retired_at IS NULL OR p.retired_at > now())
          AND EXISTS (SELECT 1 FROM evals.generation_provider_route r WHERE r.provider_revision_id=p.id)),
      (SELECT count(*) FROM evals.workflow_step WHERE reason_code='budget_exceeded' AND updated_at > now()-interval '24 hours'),
      (SELECT count(*) FROM evals.export_job WHERE status='failed' AND updated_at > now()-interval '24 hours')" 2>/dev/null || echo "x x x x x x")
  if [[ $stuck == x ]]; then
    flag database_unreadable "Evaluation health signals could not be read from PostgreSQL."
  else
    (( stuck > 0 )) && flag queue_stuck "${stuck} queue deliveries are older than 15 minutes."
    (( expired > 0 )) && flag lease_expired "${expired} running steps hold expired leases."
    (( unknown > 0 )) && flag unresolved_attempts "${unknown} paid or external calls have an unknown outcome and need reconciliation."
    (( providers > 0 )) && flag provider_unhealthy "${providers} routed model revisions report an unhealthy state."
    (( budget > 0 )) && flag budget_pauses "${budget} steps paused at a spending cap in the last 24 hours."
    (( renders > 0 )) && flag report_render_failed "${renders} report exports failed in the last 24 hours."
  fi

  # Launch signals (L-08). Demo failures count only service-side causes: a
  # visitor's unreachable, blocked or thin site is not our outage.
  read -r demo_finished demo_failed demo_waiting demo_wait_minutes webhooks_failed stripe_failed holds shadow_drift < <(sql caudals "
    SELECT
      (SELECT count(*) FROM demo.run WHERE finished_at > now()-interval '1 hour' AND phase IN ('done','failed')),
      (SELECT count(*) FROM demo.run WHERE finished_at > now()-interval '1 hour' AND phase='failed'
        AND coalesce(error_code,'') !~ '^(site_|target_|destination_|url_|curl_|chat_not_found|login_required|unreachable|forbidden|input_invalid|expired|not_found)'),
      (SELECT count(*) FROM demo.run WHERE queued_at IS NOT NULL AND started_at IS NULL AND phase NOT IN ('done','failed')),
      (SELECT coalesce(floor(extract(epoch FROM now()-min(queued_at))/60),0)::int FROM demo.run
        WHERE queued_at IS NOT NULL AND started_at IS NULL AND phase NOT IN ('done','failed')),
      (SELECT count(*) FROM evals.webhook_delivery WHERE status='failed' AND updated_at > now()-interval '1 hour'),
      $(optional_count billing.stripe_event status,received_at "SELECT count(*) AS c FROM billing.stripe_event WHERE status='failed' AND received_at > now()-interval '1 hour'"),
      $(optional_count billing.credit_hold state,created_at "SELECT count(*) AS c FROM billing.credit_hold WHERE state='held' AND created_at < now()-interval '24 hours'"),
      $(optional_count billing.shadow_report mismatches,generated_at "SELECT coalesce((SELECT mismatches FROM billing.shadow_report WHERE generated_at > now()-interval '26 hours' ORDER BY generated_at DESC LIMIT 1),0) AS c")" 2>/dev/null || echo "x x x x x x x x")
  if [[ $demo_finished == x ]]; then
    flag database_unreadable "Launch health signals could not be read from PostgreSQL."
  else
    if (( demo_finished >= demo_min_runs && demo_failed * 100 > demo_failure_percent * demo_finished )); then
      flag demo_failure_rate "${demo_failed} of ${demo_finished} demos finished in the last hour failed for service reasons (over ${demo_failure_percent}%)."
    fi
    (( demo_waiting > 0 && demo_wait_minutes >= queue_minutes )) && flag demo_queue_stale "${demo_waiting} demos are waiting; the oldest for ${demo_wait_minutes} minutes."
    (( webhooks_failed + stripe_failed > 0 )) && flag webhook_failures "Webhooks failed in the last hour: ${webhooks_failed} outbound deliveries, ${stripe_failed} payment events."
    (( holds > 0 )) && flag holds_stale "${holds} credit holds are unresolved after 24 hours."
    (( shadow_drift > 0 )) && flag billing_shadow_drift "The daily shadow credit report found ${shadow_drift} mismatches (billing.shadow_report)."
  fi
  engine_waiting=$(sql "$queue_database" "SELECT count(*) FROM ${queue_schema}.job WHERE state IN ('created','retry') AND start_after < now()-interval '${queue_minutes} minutes'" 2>/dev/null || echo x)
  if [[ $engine_waiting == x ]]; then
    flag database_unreadable "Engine queue signals could not be read from PostgreSQL."
  elif (( engine_waiting > 0 )); then
    flag engine_queue_stale "${engine_waiting} engine jobs have waited more than ${queue_minutes} minutes to start."
  fi
else
  flag database_down "The PostgreSQL service has no running container."
fi

# Drill: open the named alerts (or all launch alerts) without evaluating them.
if [[ -n $drill ]]; then
  drill_keys=(demo_failure_rate demo_queue_stale engine_queue_stale dgx_unreachable disk_pressure webhook_failures holds_stale billing_shadow_drift)
  [[ $drill == all ]] || IFS=, read -r -a drill_keys <<<"$drill"
  for key in "${drill_keys[@]}"; do
    [[ $key =~ ^[a-z0-9_]+$ ]] || { echo "Invalid drill key: $key" >&2; exit 2; }
    flag "$key" "[drill] Simulated ${key//_/ } alert; the next ordinary check resolves it."
  done
fi

# Decide what to send: new, daily reminder, resolved. State is written only
# after the email is accepted, so a failed send is retried on the next run.
now=$(date +%s); messages=(); opened=(); resolved=()
for key in "${!open[@]}"; do
  file="$state_dir/$key"
  if [[ ! -f $file ]]; then messages+=("OPEN  ${open[$key]}"$'\n'"      Runbook: $(runbook_for "$key")"); opened+=("$key")
  elif (( now - $(cat "$file") > 86400 )); then messages+=("STILL ${open[$key]}"$'\n'"      Runbook: $(runbook_for "$key")"); opened+=("$key"); fi
done
for file in "$state_dir"/*; do
  [[ -f $file ]] || continue
  key=$(basename "$file")
  [[ -n ${open[$key]:-} ]] || { messages+=("RESOLVED ${key//_/ }"); resolved+=("$key"); }
done
(( ${#messages[@]} )) || exit 0

body=$(printf '%s\n' "${messages[@]}"; printf '\nHost: atlantic · %s UTC\nRunbooks: %s\n' "$(date -u '+%F %H:%M')" "$runbooks")
if [[ $dry_run == true ]]; then printf '%s\n' "$body"; exit 0; fi
# credentials.env is written shell-quoted by scripts/set-app-credentials.sh.
value() { python3 -c 'import shlex,sys
for line in open(sys.argv[2]):
    name,sep,raw=line.rstrip("\n").partition("=")
    if sep and name==sys.argv[1]:
        print(" ".join(shlex.split(raw)),end=""); break' "$1" "$credentials" 2>/dev/null; }
to=${CAUDALS_ALERT_EMAIL:-$(value COLLABORATION_NOTIFICATION_EMAIL)}
from=$(value RESEND_FROM_EMAIL)
key=$(value RESEND_API_KEY)
[[ -n $to && -n $from && -n $key ]] || { printf '%s\n' "$body" >&2; exit 2; }
subject="Caudals platform alert"
[[ -n $drill ]] && subject="Caudals platform alert (drill)"
payload=$(python3 -c 'import json,sys; print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":sys.argv[3],"text":sys.stdin.read()}))' "$from" "$to" "$subject" <<<"$body")
headers=$(mktemp); chmod 600 "$headers"; trap 'rm -f "$headers"' EXIT
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$key" > "$headers"; unset key
curl -sf -m 20 "${CAUDALS_ALERT_RESEND_URL:-https://api.resend.com/emails}" -H @"$headers" --data-binary @- >/dev/null <<<"$payload"
for key in "${opened[@]}"; do echo "$now" > "$state_dir/$key"; done
for key in "${resolved[@]}"; do rm -f "$state_dir/$key"; done
echo "alerts_sent=${#messages[@]}"
