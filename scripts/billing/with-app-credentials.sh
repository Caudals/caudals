#!/usr/bin/env bash
set -euo pipefail

# Runs a command with named app credentials in its environment, read from the
# root-only /root/.caudals/app/credentials.env without printing them.
# Usage: scripts/billing/with-app-credentials.sh KEY[,KEY...] -- command [args...]
keys="${1:?KEY[,KEY...] required}"
shift
[[ "${1:-}" == "--" ]] && shift
[[ $# -gt 0 ]] || { echo "command required" >&2; exit 2; }
[[ $keys =~ ^[A-Z0-9_]+(,[A-Z0-9_]+)*$ ]] || { echo "invalid key list" >&2; exit 2; }
exports="$(sudo -n python3 - "$keys" <<'PY'
import shlex, sys
wanted = sys.argv[1].split(",")
for line in open("/root/.caudals/app/credentials.env"):
    name, sep, raw = line.rstrip("\n").partition("=")
    if sep and name in wanted:
        print("export %s=%s" % (name, shlex.quote(" ".join(shlex.split(raw)))))
PY
)"
eval "$exports"
unset exports
exec "$@"
