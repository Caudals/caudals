#!/usr/bin/env bash
# Operational alerts for caudals-1 (spec §17.6), run by caudals-evals-health.timer.
# Checks host pressure, Swarm convergence, DGX reachability, backup age and
# evaluation signals (stuck queue, expired leases, unresolved paid attempts,
# unhealthy providers, budget pauses, failed report rendering). Each alert is
# emailed once when it opens, repeated at most daily while open, and once when
# it resolves. Messages carry counts and names only: no prompts, customer
# content, secrets or private endpoints.
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run as root on caudals-1" >&2; exit 1; }
state_dir="${CAUDALS_ALERT_STATE_DIR:-/root/.caudals/evals-production/alerts}"
credentials="${CAUDALS_APP_CREDENTIALS:-/root/.caudals/app/credentials.env}"
dgx_endpoint_file="${CAUDALS_DGX_ENDPOINT_FILE:-/root/.caudals/evals-production/dgx-endpoint}"
backup_dir="${CAUDALS_BACKUP_DIR:-/root/.caudals/backups}"
dry_run="${CAUDALS_ALERT_DRY_RUN:-false}"
install -d -m 700 "$state_dir"

declare -A open=()
flag() { open["$1"]="$2"; }

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

# Evaluation signals (aggregates only, across tenants, as the database owner).
pg=$(docker ps -q -f name=caudals-postgres_db | head -n1)
if [[ -n $pg ]]; then
  read -r stuck expired unknown providers budget renders < <(docker exec "$pg" psql -U postgres -d caudals -AtF ' ' -c "
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
else
  flag database_down "The PostgreSQL service has no running container."
fi

# Decide what to send: new, daily reminder, resolved.
now=$(date +%s); messages=()
for key in "${!open[@]}"; do
  file="$state_dir/$key"
  if [[ ! -f $file ]]; then messages+=("OPEN  ${open[$key]}"); echo "$now" > "$file"
  elif (( now - $(cat "$file") > 86400 )); then messages+=("STILL ${open[$key]}"); echo "$now" > "$file"; fi
done
for file in "$state_dir"/*; do
  [[ -f $file ]] || continue
  key=$(basename "$file")
  [[ -n ${open[$key]:-} ]] || { messages+=("RESOLVED ${key//_/ }"); rm -f "$file"; }
done
(( ${#messages[@]} )) || exit 0

body=$(printf '%s\n' "${messages[@]}"; printf '\nHost: caudals-1 · %s UTC\nRunbooks: docs/evals/runbooks.md\n' "$(date -u '+%F %H:%M')")
if [[ $dry_run == true ]]; then printf '%s\n' "$body"; exit 0; fi
value() { grep -E "^$1=" "$credentials" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
to=${CAUDALS_ALERT_EMAIL:-$(value COLLABORATION_NOTIFICATION_EMAIL)}
from=$(value RESEND_FROM_EMAIL)
key=$(value RESEND_API_KEY)
[[ -n $to && -n $from && -n $key ]] || { printf '%s\n' "$body" >&2; exit 2; }
payload=$(python3 -c 'import json,sys; print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":"Caudals platform alert","text":sys.stdin.read()}))' "$from" "$to" <<<"$body")
headers=$(mktemp); chmod 600 "$headers"; trap 'rm -f "$headers"' EXIT
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$key" > "$headers"; unset key
curl -sf -m 20 https://api.resend.com/emails -H @"$headers" --data-binary @- >/dev/null <<<"$payload"
echo "alerts_sent=${#messages[@]}"
