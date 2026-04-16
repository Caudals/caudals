# 2026-04-03 - Phase 36 Direct Tailscale Dashboard Access

## Summary
- Replaced SSH tunnel-based dashboard access with direct Tailscale-only URLs.
- Removed the temporary tunnel helper script.
- Kept the dashboards inaccessible from the public internet.

## Changes
- Added a host-level Nginx reverse proxy on the VPS for direct private dashboard access:
  - port `7443` proxies to Dokploy
  - port `7444` proxies to Umami
- Restricted `7443/tcp` and `7444/tcp` to `tailscale0` in UFW.
- Removed the obsolete `scripts/tailscale-dashboard-tunnel.sh`.
- Updated the access documentation to use direct URLs:
  - `http://ubuntu-caudals:7443`
  - `http://ubuntu-caudals:7444`

## Notes
- Tailscale Serve was evaluated but not used because it is not enabled on the tailnet.
- The direct dashboard URLs remain private because they are reachable only across Tailscale and are blocked on the public interface.
