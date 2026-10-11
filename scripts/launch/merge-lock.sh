#!/usr/bin/env bash
set -euo pipefail

# One package at a time merges, migrates, deploys and sets flags.
# Usage: scripts/launch/merge-lock.sh acquire|release|status <L-xx>
# acquire waits up to MERGE_LOCK_WAIT_SECONDS (default 540, under the 10-minute
# tool limit) and exits 1 with the current holder if the lock is still taken;
# call it again to keep waiting. A lock older than 4 hours is treated as stale.
action="${1:?acquire|release|status}"
owner="${2:-}"
dir="${CAUDALS_MERGE_LOCK:-/home/caudals/.cache/caudals-merge.lock}"
mkdir -p "$(dirname "$dir")"

holder() { cat "$dir/owner" 2>/dev/null || echo unknown; }
age() { echo $(( $(date +%s) - $(stat -c %Y "$dir" 2>/dev/null || date +%s) )); }

case "$action" in
  acquire)
    [[ -n $owner ]] || { echo "owner required" >&2; exit 2; }
    deadline=$(( $(date +%s) + ${MERGE_LOCK_WAIT_SECONDS:-540} ))
    while ! mkdir "$dir" 2>/dev/null; do
      if [[ "$(holder)" == "$owner" ]]; then echo "Already held by $owner"; exit 0; fi
      if (( $(age) > 14400 )); then
        echo "Breaking stale lock held by $(holder) for $(age)s" >&2
        rm -rf "$dir"
        continue
      fi
      if (( $(date +%s) > deadline )); then
        echo "Still held by $(holder) for $(age)s; call acquire again" >&2
        exit 1
      fi
      sleep 15
    done
    echo "$owner" >"$dir/owner"
    echo "Acquired by $owner"
    ;;
  release)
    if [[ -d $dir && "$(holder)" != "$owner" ]]; then
      echo "Lock is held by $(holder), not $owner" >&2
      exit 1
    fi
    rm -rf "$dir"
    echo "Released"
    ;;
  status)
    if [[ -d $dir ]]; then echo "Held by $(holder) for $(age)s"; else echo "Free"; fi
    ;;
  *) echo "usage: $0 acquire|release|status <L-xx>" >&2; exit 2 ;;
esac
