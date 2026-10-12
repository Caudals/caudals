#!/usr/bin/env bash
# External uptime checks (launch L-08, spec P-48, decision I-5), run every
# minute by caudals-uptime.timer from arctic, a different host and provider
# from the one serving the site. Checks the landing page, the demo API, app
# sign-in (page and auth API) and the webhook health endpoint through the
# public internet. A check fails only when two attempts five seconds apart
# both fail, so an outage alerts within about 90 seconds and a single blip
# does not. Each failure is emailed once when it opens, repeated at most every
# six hours while open, and once when it resolves, with its runbook.
#
# Credentials: CAUDALS_ALERT_CREDENTIALS (default /root/.caudals/alerts.env)
# with RESEND_API_KEY, RESEND_FROM_EMAIL and ALERT_EMAIL (or
# COLLABORATION_NOTIFICATION_EMAIL), shell-quoted, mode 600.
#
# Drill: put a check name in /root/.caudals/uptime-drill (or set
# CAUDALS_UPTIME_DRILL) and that check requests a path that does not exist,
# a real failure through the real network path. Remove it to resolve.
set -euo pipefail

state_dir="${CAUDALS_UPTIME_STATE_DIR:-/root/.caudals/uptime-alerts}"
credentials="${CAUDALS_ALERT_CREDENTIALS:-/root/.caudals/alerts.env}"
drill_file="${CAUDALS_UPTIME_DRILL_FILE:-/root/.caudals/uptime-drill}"
dry_run="${CAUDALS_ALERT_DRY_RUN:-false}"
source_host="${CAUDALS_UPTIME_SOURCE:-$(hostname)}"
site="${CAUDALS_UPTIME_SITE:-https://caudals.com}"
app="${CAUDALS_UPTIME_APP:-https://app.caudals.com}"
runbook="${CAUDALS_RUNBOOK_URL:-https://github.com/Caudals/caudals/blob/main/docs/evals/runbooks.md}#19-uptime-check-failed"
reminder_seconds=$((6 * 3600))
drill="${CAUDALS_UPTIME_DRILL:-}"
[[ -z $drill && -s $drill_file ]] && drill=$(tr -dc 'a-z_' <"$drill_file")
install -d -m 700 "$state_dir"
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT

# name|label|url|text the body must contain
checks=(
  "landing|Landing page|$site/en|Caudals"
  "demo_api|Demo API|$site/api/demo/challenge|\"service\""
  "app_sign_in|App sign-in page|$app/workspace/sign-in|Caudals"
  "auth_api|App sign-in API|$app/api/auth/ok|\"ok\""
  "webhook_health|Webhook health|$app/api/evals/v1/health/webhooks|\"status\":\"ok\""
)

probe() { # <name> <url> <expect> -> writes "ok" or a short reason to $work/<name>
  local name=$1 url=$2 expect=$3 code body="$work/$1.body" attempt reason=""
  [[ $drill == "$name" ]] && url="${url%%/api/*}/__caudals-uptime-drill-$name"
  for attempt in 1 2; do
    code=$(curl -sS -o "$body" -m 15 -A "caudals-uptime/1 (+$source_host)" -H 'Cache-Control: no-cache' \
      -w '%{http_code}' "$url" 2>/dev/null) || code=${code:-000}
    if [[ $code == 200 ]] && grep -qF -- "$expect" "$body"; then echo ok >"$work/$name"; return; fi
    if [[ $code == 200 ]]; then reason="HTTP 200 without the expected content"
    elif [[ $code == 000 ]]; then reason="no response (timeout, DNS or TLS)"
    else reason="HTTP $code"; fi
    (( attempt == 1 )) && sleep 5
  done
  echo "$reason" >"$work/$name"
}

for entry in "${checks[@]}"; do
  IFS='|' read -r name _ url expect <<<"$entry"
  probe "$name" "$url" "$expect" &
done
wait

declare -A open=()
for entry in "${checks[@]}"; do
  IFS='|' read -r name label url _ <<<"$entry"
  result=$(cat "$work/$name" 2>/dev/null || echo "check did not run")
  [[ $result == ok ]] || open["uptime_$name"]="$label is down: $result (${url%%\?*})."
done

now=$(date +%s); messages=(); opened=(); resolved=()
for key in "${!open[@]}"; do
  file="$state_dir/$key"
  if [[ ! -f $file ]]; then messages+=("OPEN  ${open[$key]}"); opened+=("$key")
  elif (( now - $(cat "$file") > reminder_seconds )); then messages+=("STILL ${open[$key]}"); opened+=("$key"); fi
done
for file in "$state_dir"/*; do
  [[ -f $file ]] || continue
  key=$(basename "$file")
  [[ -n ${open[$key]:-} ]] || { messages+=("RESOLVED ${key#uptime_} is answering again."); resolved+=("$key"); }
done
(( ${#messages[@]} )) || { echo "uptime_ok checks=${#checks[@]}"; exit 0; }

body=$(printf '%s\n' "${messages[@]}"; printf '\nRunbook: %s\nChecked from: %s · %s UTC\n' "$runbook" "$source_host" "$(date -u '+%F %H:%M:%S')")
if [[ $dry_run == true ]]; then printf '%s\n' "$body"; exit 0; fi
value() { python3 -c 'import shlex,sys
for line in open(sys.argv[2]):
    name,sep,raw=line.rstrip("\n").partition("=")
    if sep and name==sys.argv[1]:
        print(" ".join(shlex.split(raw)),end=""); break' "$1" "$credentials" 2>/dev/null; }
to=${CAUDALS_ALERT_EMAIL:-$(value ALERT_EMAIL)}
[[ -n $to ]] || to=$(value COLLABORATION_NOTIFICATION_EMAIL)
from=$(value RESEND_FROM_EMAIL)
key=$(value RESEND_API_KEY)
[[ -n $to && -n $from && -n $key ]] || { printf '%s\n' "$body" >&2; exit 2; }
subject="Caudals uptime alert"
[[ -n $drill ]] && subject="Caudals uptime alert (drill)"
payload=$(python3 -c 'import json,sys; print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":sys.argv[3],"text":sys.stdin.read()}))' "$from" "$to" "$subject" <<<"$body")
headers="$work/headers"; ( umask 077; printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$key" >"$headers" ); unset key
curl -sf -m 20 "${CAUDALS_ALERT_RESEND_URL:-https://api.resend.com/emails}" -H @"$headers" --data-binary @- >/dev/null <<<"$payload"
for key in "${opened[@]}"; do echo "$now" >"$state_dir/$key"; done
for key in "${resolved[@]}"; do rm -f "$state_dir/$key"; done
echo "alerts_sent=${#messages[@]}"
