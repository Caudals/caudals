#!/usr/bin/env bash
set -euo pipefail

# Builds and pushes the evaluation worker images for one commit while the
# GitHub `evals-images.yml` workflow stays manually disabled (it was turned off
# to save Actions minutes; do not re-enable it).
#
# Usage (from a clean worktree checked out at <full-sha>, holding the merge lock):
#   scripts/launch/build-worker-images.sh <full-sha>
#   sudo env EVALS_IMAGE_COMMIT=<full-sha> scripts/deploy-evals-production.sh
#
# Default (overlay): the images running in production are the bases; /app/lib
# and /app/services are replaced with the committed source. This is only valid
# when package.json, package-lock.json, tsconfig.json and infra/evals/Dockerfile*
# are identical to the running images' commit, which the script checks.
# FULL_BUILD=true builds infra/evals/Dockerfile and Dockerfile.playwright from
# scratch instead (needed after a dependency change; slow, runs at low priority).
sha="${1:?full commit sha required}"
image_repo="${CAUDALS_APP_IMAGE_REPO:-mariomedpar/caudals}"
[[ ${#sha} == 40 ]] || { echo "Pass the full 40-character sha" >&2; exit 2; }
[[ $(git rev-parse HEAD) == "$sha" ]] || { echo "HEAD is not $sha; run from a worktree at that commit" >&2; exit 1; }
[[ -z $(git status --porcelain --untracked-files=no) ]] || { echo "Worktree has uncommitted changes" >&2; exit 1; }
git merge-base --is-ancestor "$sha" origin/main 2>/dev/null || { echo "$sha is not on origin/main yet; push first" >&2; exit 1; }

running() { # <service> <tag prefix> -> "digest commit"
  local digest tag
  digest="$(sudo docker service inspect "$1" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' | sed -n 's/.*@\(sha256:.*\)/\1/p')"
  tag="$(sudo docker image ls "$image_repo" --format '{{.Tag}} {{.Digest}}' | awk -v d="$digest" -v p="$2" '$2==d && index($1,p)==1 {print substr($1,length(p)+1); exit}')"
  echo "$digest $tag"
}

dep_files=(package.json package-lock.json tsconfig.json infra/evals/Dockerfile infra/evals/Dockerfile.playwright)
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for kind in worker playwright; do
  target="$image_repo:evals-$kind-$sha"
  service=caudals-evals_worker; [[ $kind == playwright ]] && service=caudals-evals_browser
  if [[ ${FULL_BUILD:-false} == true ]]; then
    dockerfile=infra/evals/Dockerfile; [[ $kind == playwright ]] && dockerfile=infra/evals/Dockerfile.playwright
    sudo nice -n 15 ionice -c3 env DOCKER_BUILDKIT=1 docker build --build-arg "RELEASE_COMMIT=$sha" -f "$dockerfile" -t "$target" .
  else
    read -r base_digest base_commit < <(running "$service" "evals-$kind-")
    [[ -n $base_digest && -n $base_commit ]] || { echo "Cannot resolve the running $kind image and its commit" >&2; exit 1; }
    git cat-file -e "$base_commit^{commit}" 2>/dev/null || git fetch -q origin
    if ! git diff --quiet "$base_commit" "$sha" -- "${dep_files[@]}"; then
      echo "Dependency files changed since $base_commit; rerun with FULL_BUILD=true" >&2
      exit 1
    fi
    copies="COPY lib ./lib
COPY services/evals-worker ./services/evals-worker"
    [[ $kind == playwright ]] && copies="COPY lib ./lib
COPY services/evals-browser ./services/evals-browser
COPY services/evals-documents ./services/evals-documents"
    cat >"$work/Dockerfile.$kind" <<EOF
FROM $image_repo@$base_digest
ARG RELEASE_COMMIT
LABEL org.opencontainers.image.revision=\$RELEASE_COMMIT
USER root
RUN rm -rf /app/lib /app/services
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
$copies
USER node
EOF
    echo "Overlaying $kind source from $sha onto $base_commit ($base_digest)"
    sudo env DOCKER_BUILDKIT=1 docker build --build-arg "RELEASE_COMMIT=$sha" -f "$work/Dockerfile.$kind" -t "$target" .
  fi
  sudo docker push "$target" | tail -1
done
echo "Built and pushed evals-worker-$sha and evals-playwright-$sha."
echo "Deploy: sudo env EVALS_IMAGE_COMMIT=$sha scripts/deploy-evals-production.sh"
