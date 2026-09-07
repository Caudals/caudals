#!/usr/bin/env bash
# Points this clone's hooks at scripts/git-hooks so the secret-scan pre-commit
# hook runs. Re-run after cloning; git does not share hooks over the network.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git config core.hooksPath scripts/git-hooks
echo "core.hooksPath -> scripts/git-hooks"

if command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks $(gitleaks version) found; commits will be scanned."
else
  echo
  echo "gitleaks is NOT installed, so the hook will warn instead of scanning."
  echo "  macOS:  brew install gitleaks"
  echo "  other:  https://github.com/gitleaks/gitleaks/releases"
fi
