#!/usr/bin/env bash
set -euo pipefail

# Installs the one-minute external uptime checks (launch L-08, decision I-5).
# Their home is arctic, a different host and provider from atlantic. Run from
# a checkout, or from a directory holding uptime-checks.sh,
# caudals-uptime.service and caudals-uptime.timer next to this script:
#
#   sudo scripts/install-uptime-checks.sh                       # arctic
#   sudo CAUDALS_UPTIME_CREDENTIALS=/root/.caudals/app/credentials.env \
#        scripts/install-uptime-checks.sh                       # atlantic (interim)
#
# Alerts use the host's existing alert routing: arctic's /root/.caudals/alerts.env
# (RESEND_API_KEY, RESEND_FROM_EMAIL, ALERT_EMAIL) by default. The script is
# copied, not linked, so later checkout changes never alter what runs.
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
find_file() { for candidate in "$@"; do [[ -f $candidate ]] && { echo "$candidate"; return; }; done; echo "Missing $1" >&2; exit 1; }
script=$(find_file "$root/scripts/uptime-checks.sh" "$here/uptime-checks.sh")
service=$(find_file "$root/infra/host/caudals-uptime.service" "$here/caudals-uptime.service")
timer=$(find_file "$root/infra/host/caudals-uptime.timer" "$here/caudals-uptime.timer")
credentials="${CAUDALS_UPTIME_CREDENTIALS:-/root/.caudals/alerts.env}"
[[ -s $credentials ]] || { echo "Alert credentials not found: $credentials" >&2; exit 1; }
for tool in curl python3; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done

install -m 0755 "$script" /usr/local/sbin/caudals-uptime
install -m 0644 "$service" /etc/systemd/system/caudals-uptime.service
install -m 0644 "$timer" /etc/systemd/system/caudals-uptime.timer
umask 077
printf 'CAUDALS_ALERT_CREDENTIALS=%s\nCAUDALS_UPTIME_SOURCE=%s\n' "$credentials" "$(hostname)" >/etc/default/caudals-uptime
systemctl daemon-reload
systemctl enable --now caudals-uptime.timer
systemctl start caudals-uptime.service || true
systemctl list-timers caudals-uptime.timer --no-pager
journalctl -u caudals-uptime.service -n 3 --no-pager -o cat
