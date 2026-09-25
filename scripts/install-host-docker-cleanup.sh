#!/usr/bin/env bash
set -euo pipefail

# Installs the periodic Docker cleanup on caudals-1 from this checkout. The
# script is copied, not linked, so a later `git reset --hard` by the deploy job
# never changes what the timer runs; re-run this after changing it.

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run with sudo on caudals-1." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install -m 0755 "$root/scripts/host-docker-cleanup.sh" /usr/local/sbin/caudals-docker-cleanup
install -m 0644 "$root/infra/host/caudals-docker-cleanup.service" /etc/systemd/system/caudals-docker-cleanup.service
install -m 0644 "$root/infra/host/caudals-docker-cleanup.timer" /etc/systemd/system/caudals-docker-cleanup.timer

# One finished task per service is enough to debug a failed rollout; more pins
# old images that the cleanup then cannot remove.
docker swarm update --task-history-limit 1 >/dev/null

systemctl daemon-reload
systemctl enable --now caudals-docker-cleanup.timer
systemctl list-timers caudals-docker-cleanup.timer --no-pager
