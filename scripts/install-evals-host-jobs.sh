#!/usr/bin/env bash
set -euo pipefail

# Installs the daily encrypted backup and the operational alert timers on
# caudals-1 from this checkout. Scripts are copied, not linked, so a later
# checkout change never alters what the timers run; re-run after changing them.
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run with sudo on caudals-1." >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -m 0755 "$root/scripts/evals/backup.sh" /usr/local/sbin/caudals-evals-backup
install -m 0755 "$root/scripts/evals/health-alerts.sh" /usr/local/sbin/caudals-evals-health
for unit in caudals-evals-backup caudals-evals-health; do
  install -m 0644 "$root/infra/host/$unit.service" "/etc/systemd/system/$unit.service"
  install -m 0644 "$root/infra/host/$unit.timer" "/etc/systemd/system/$unit.timer"
done
systemctl daemon-reload
systemctl enable --now caudals-evals-backup.timer caudals-evals-health.timer
systemctl list-timers 'caudals-evals-*' --no-pager
