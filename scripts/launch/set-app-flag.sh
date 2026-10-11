#!/usr/bin/env bash
set -euo pipefail

# Sets one app runtime flag in /root/.caudals/app/credentials.env and redeploys
# the app stack with the image that is already running (no rebuild).
# Usage: scripts/launch/set-app-flag.sh KEY VALUE
# The key must be in the allowlist of scripts/set-app-credentials.sh, which
# lives in the commit that is deployed, so add new flags there first.
key="${1:?KEY required}"
value="${2:?VALUE required}"
repo=/home/caudals/caudals
printf '%s\n' "$value" | sudo "$repo/scripts/set-app-credentials.sh" "$key"
digest="$(sudo docker service inspect caudals-app_app --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' | sed -n 's/.*@\(sha256:.*\)/\1/p')"
tag="$(sudo docker image ls mariomedpar/caudals --format '{{.Tag}} {{.Digest}}' | awk -v d="$digest" '$2==d && $1 ~ /^[0-9a-f]{40}$/ {print $1; exit}')"
[[ -n $tag ]] || { echo "Could not resolve the running app commit" >&2; exit 1; }
worktree="$repo/.worktrees/flag-$tag-$$"
git -C "$repo" worktree add --detach "$worktree" "$tag" >/dev/null
trap 'git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true' EXIT
sudo env CAUDALS_APP_BUILD_LOCAL=false CAUDALS_APP_BUILD_TAG="$tag" "$worktree/scripts/deploy-app-stack.sh" >/dev/null
echo "Set $key and redeployed app image $tag"
