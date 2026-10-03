#!/bin/sh
set -eu

echo "=== Warmbly Swarm Update Started at $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

ROOT="/opt/warmbly"
cd "$ROOT"

# Ensure required runtime tools exist
if ! command -v python3 >/dev/null 2>&1; then
    if command -v apk >/dev/null 2>&1; then
        echo "Installing python3..."
        apk add --no-cache python3
    else
        echo "ERROR: python3 not found." >&2
        exit 1
    fi
fi

# Detect target tag: from $1, from git describe (if Go updater just checked it out), or from .env
if [ -n "${1:-}" ]; then
    TARGET_TAG="$1"
elif [ -d "$ROOT/.git" ] && git -C "$ROOT" describe --tags --exact-match >/dev/null 2>&1; then
    TARGET_TAG="$(git -C "$ROOT" describe --tags --exact-match)"
else
    TARGET_TAG="$(grep -E '^WARMBLY_TAG=' "$ROOT/.env" | cut -d= -f2 | tr -d '[:space:]"'\''')"
fi

if [ -z "$TARGET_TAG" ]; then
    echo "ERROR: Unable to determine target WARMBLY_TAG." >&2
    exit 1
fi

echo "Target version: $TARGET_TAG"

# Ensure .env has target version
CURRENT_TAG="$(grep -E '^WARMBLY_TAG=' "$ROOT/.env" | cut -d= -f2 | tr -d '[:space:]"'\''')"
if [ "$CURRENT_TAG" != "$TARGET_TAG" ]; then
    echo "Updating WARMBLY_TAG in .env to $TARGET_TAG..."
    sed -i "s/^WARMBLY_TAG=.*/WARMBLY_TAG=$TARGET_TAG/" "$ROOT/.env"
fi

# Ensure git is checked out to target tag if git repo exists
if [ -d "$ROOT/.git" ]; then
    echo "Syncing git checkout to $TARGET_TAG..."
    git -C "$ROOT" checkout -q --detach "$TARGET_TAG" 2>/dev/null || true
fi

# Fetch release manifest
MANIFEST_URL="https://github.com/warmbly/warmbly/releases/download/${TARGET_TAG}/images.json"
echo "Fetching release manifest from $MANIFEST_URL..."
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$MANIFEST_URL" -o "$ROOT/images.json.tmp"
else
    wget -qO "$ROOT/images.json.tmp" "$MANIFEST_URL"
fi
mv "$ROOT/images.json.tmp" "$ROOT/images.json"

# Pre-pull new images so Swarm rollout is fast and does not timeout
echo "Pre-pulling images for $TARGET_TAG..."
python3 -c "
import json, subprocess
with open('$ROOT/images.json') as f:
    m = json.load(f)
for role, digest in m['images'].items():
    if role == 'web': continue
    img = f'{m[\"registry\"]}/{role}@{digest}'
    print(f'Pulling {role}: {img}')
    subprocess.run(['docker', 'pull', img], check=False)
"

# Run prepare.py to generate stack.yml and secrets
echo "Regenerating stack.yml and secrets via prepare.py..."
python3 "$ROOT/prepare.py"

# Deploy updated Swarm stack
echo "Deploying Swarm stack caudals-warmbly..."
docker stack deploy -c "$ROOT/stack.yml" caudals-warmbly

# Schedule updater container rollout after deployment settles
(
    sleep 75
    NEW_UPDATER="$(python3 -c "import json; m=json.load(open('$ROOT/images.json')); print(m['registry'] + '/updater@' + m['images']['updater'])" 2>/dev/null || true)"
    CUR_UPDATER="$(docker service inspect caudals-warmbly_updater --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || true)"
    if [ -n "$NEW_UPDATER" ] && [ "$NEW_UPDATER" != "$CUR_UPDATER" ]; then
        echo "Updating caudals-warmbly_updater to $NEW_UPDATER..."
        docker service update --image "$NEW_UPDATER" caudals-warmbly_updater
    fi
) >/dev/null 2>&1 &

echo "=== Warmbly Swarm Update Command Completed Successfully ==="
exit 0
