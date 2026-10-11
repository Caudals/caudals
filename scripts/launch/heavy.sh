#!/usr/bin/env bash
set -euo pipefail

# Runs one heavy local check (typecheck, vitest, Playwright, the disposable
# database) at low priority and one at a time across every agent session.
# atlantic also serves production, so parallel checks must not compete for its
# 4 CPUs and 7 GB of memory.
lock="${CAUDALS_HEAVY_LOCK:-/home/caudals/.cache/caudals-heavy.lock}"
mkdir -p "$(dirname "$lock")"
exec flock -w "${CAUDALS_HEAVY_WAIT_SECONDS:-5400}" "$lock" nice -n 15 ionice -c3 "$@"
