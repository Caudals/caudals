#!/usr/bin/env bash
# Host-level operational alerts for secondary hosts (arctic), run by
# caudals-host-health.timer. The evaluation-specific checks live in
# scripts/evals/health-alerts.sh on atlantic. Checks disk and memory pressure,
# Swarm convergence and the edge Traefik container. Each alert is emailed once
# when it opens, repeated at most daily while open, and once when it resolves.
# Credentials: /root/.caudals/alerts.env with RESEND_API_KEY, RESEND_FROM_EMAIL
# and ALERT_EMAIL (shell-quoted, mode 600).
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
state_dir="${CAUDALS_ALERT_STATE_DIR:-/root/.caudals/host-alerts}"
credentials="${CAUDALS_ALERT_CREDENTIALS:-/root/.caudals/alerts.env}"
dry_run="${CAUDALS_ALERT_DRY_RUN:-false}"
host=$(hostname)
install -d -m 700 "$state_dir"

declare -A open=()
flag() { open["$1"]="$2"; }

disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
(( disk >= ${CAUDALS_ALERT_DISK_PERCENT:-85} )) && flag disk_pressure "Root disk is ${disk}% used."
mem_avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
(( mem_avail < ${CAUDALS_ALERT_MEM_MB:-300} )) && flag memory_pressure "Only ${mem_avail} MiB of memory is available."
swap_free=$(awk '/SwapFree/ {print int($2/1024)}' /proc/meminfo)
(( swap_free < ${CAUDALS_ALERT_SWAP_MB:-512} )) && flag swap_pressure "Only ${swap_free} MiB of swap is free."

while IFS='|' read -r name replicas; do
  current=${replicas%%/*}; desired=${replicas##*/}; desired=${desired%% *}
  [[ $current == "$desired" ]] || flag "service_${name}" "Service ${name} is at ${replicas}."
done < <(docker service ls --format '{{.Name}}|{{.Replicas}}')

[[ $(docker inspect -f '{{.State.Running}}' dokploy-traefik 2>/dev/null) == true ]] \
  || flag traefik_down "The dokploy-traefik container is not running."

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

body=$(printf '%s\n' "${messages[@]}"; printf '\nHost: %s · %s UTC\n' "$host" "$(date -u '+%F %H:%M')")
if [[ $dry_run == true ]]; then printf '%s\n' "$body"; exit 0; fi
value() { python3 -c 'import shlex,sys
for line in open(sys.argv[2]):
    name,sep,raw=line.rstrip("\n").partition("=")
    if sep and name==sys.argv[1]:
        print(" ".join(shlex.split(raw)),end=""); break' "$1" "$credentials" 2>/dev/null; }
to=$(value ALERT_EMAIL)
from=$(value RESEND_FROM_EMAIL)
key=$(value RESEND_API_KEY)
[[ -n $to && -n $from && -n $key ]] || { printf '%s\n' "$body" >&2; exit 2; }
payload=$(python3 -c 'import json,sys; print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":"Caudals "+sys.argv[3]+" alert","text":sys.stdin.read()}))' "$from" "$to" "$host" <<<"$body")
headers=$(mktemp); chmod 600 "$headers"; trap 'rm -f "$headers"' EXIT
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$key" > "$headers"; unset key
curl -sf -m 20 https://api.resend.com/emails -H @"$headers" --data-binary @- >/dev/null <<<"$payload"
echo "alerts_sent=${#messages[@]}"
