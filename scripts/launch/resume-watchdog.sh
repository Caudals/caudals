#!/usr/bin/env bash
set -euo pipefail

# Host-level watchdog for the spec-v2 launch build. When the orchestrator
# Claude session stalls (for example after a usage limit, when its in-session
# cron stops firing), this sends it one short cross-session message so it
# resumes. It never starts package work itself.
#
# Config: ~/.config/caudals-launch/watchdog.env
#   SESSION_FILE=<orchestrator transcript .jsonl>   # its mtime is the heartbeat
#   SESSION_NAME=<session name as ListAgents prints it>
#   STALE_MINUTES=50  NUDGE_EVERY_MINUTES=55        # optional
# Install: crontab line `*/20 * * * * <repo>/scripts/launch/resume-watchdog.sh`
# Log: ~/.cache/caudals-launch/watchdog.log
repo=/home/caudals/caudals
config="${CAUDALS_WATCHDOG_CONFIG:-$HOME/.config/caudals-launch/watchdog.env}"
state="$HOME/.cache/caudals-launch"
mkdir -p "$state"
log="$state/watchdog.log"
exec 9>"$state/watchdog.lock"
flock -n 9 || exit 0
say() { echo "$(date -u +%FT%TZ) $*" >>"$log"; }

[[ -f $config ]] || { say "no config at $config"; exit 0; }
# shellcheck disable=SC1090
. "$config"
: "${SESSION_FILE:?}" "${SESSION_NAME:?}"
stale=${STALE_MINUTES:-50}
every=${NUDGE_EVERY_MINUTES:-55}

# Done when no package row in PROGRESS.md §2 is still todo or in progress.
remaining=$(git -C "$repo" show origin/main:docs/launch/PROGRESS.md 2>/dev/null \
  | grep -E '^\| [0-9] \| (L-[0-9]+[a-z]?|[GR][0-9]+) \|' | grep -cE '\| (todo|in progress) \|' || true)
if [[ ${remaining:-0} == 0 ]]; then say "all packages done or blocked; nothing to do"; exit 0; fi

[[ -f $SESSION_FILE ]] || { say "session file missing: $SESSION_FILE"; exit 0; }
age=$(( ($(date +%s) - $(stat -c %Y "$SESSION_FILE")) / 60 ))
(( age >= stale )) || exit 0
last=0; [[ -f $state/last-nudge ]] && last=$(cat "$state/last-nudge")
(( ($(date +%s) - last) / 60 >= every )) || exit 0

cli=$(ls -d "$HOME"/.claude/remote/ccd-cli/2.* 2>/dev/null | sort -V | tail -1)
[[ -x ${cli:-} ]] || cli=$(command -v claude)
msg="Watchdog: the launch-build orchestrator has been quiet for ${age} minutes with ${remaining} packages left. If a usage limit stopped you, it may have reset: continue the launch build from docs/launch/PROGRESS.md (check the merge lock and worktrees, resume stopped package agents, start the next ones)."
prompt="Use ToolSearch with query 'select:SendMessage' to load SendMessage. Then call SendMessage once, with to set to '${SESSION_NAME}' and message set to exactly the text between <msg> and </msg>, without the tags and without adding anything: <msg>${msg}</msg> If the name is ambiguous, call ListAgents and use the row whose name starts with '${SESSION_NAME}'. Then reply with SENT or FAILED and the reason."
date +%s >"$state/last-nudge"
out=$(cd "$HOME" && timeout 180 "$cli" -p --model haiku --max-turns 6 "$prompt" 2>&1 | tail -3 | tr '\n' ' ') || true
say "quiet ${age}m, ${remaining} left -> ${out}"
# Only a delivered nudge starts the cooldown; a failed one (usage limit, auth)
# retries on the next cron run so the session wakes soon after a reset.
[[ $out == *SENT* ]] || rm -f "$state/last-nudge"
