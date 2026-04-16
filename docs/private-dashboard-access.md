# Private Dashboard Access

## Purpose
- Document how to access private operational dashboards after the 2026-04-03 hardening pass removed them from the public internet.

## Current Security Posture
- `https://dokploy.caudals.com/` no longer serves the Dokploy login UI publicly.
- `https://analytics.caudals.com/` no longer serves the Umami dashboard publicly.
- `https://analytics.caudals.com/script.js` remains public because the product analytics collector still depends on it.
- Public tracking ingestion remains available on `https://analytics.caudals.com/api/send`.
- Dashboard access is now direct over Tailscale-only ports.

## Prerequisites
- Tailscale must be connected on the client device.
- The VPS must be reachable as `ubuntu-caudals` on the tailnet.

## Direct URLs

### Dokploy
- Preferred:
  - `http://ubuntu-caudals:7443`
- Fallback:
  - `http://100.92.160.68:7443`

### Umami
- Preferred:
  - `http://ubuntu-caudals:7444`
- Fallback:
  - `http://100.92.160.68:7444`

## Notes
- These ports are exposed only on the tailnet. Public probes to `161.35.200.8:7443` and `:7444` are blocked.
- The transport is still encrypted by Tailscale even though the local dashboard URLs use `http://`.
- The host-level reverse proxy that serves these ports is Nginx on the VPS, and it forwards privately to Traefik using internal-only hostnames.

## Related Security Notes
- Public admin surfaces are not acceptable just because they present a password screen.
- If Dokploy or Umami are redeployed and access breaks or public routes reappear, re-check:
  - `/etc/nginx/sites-available/caudals-tailscale-dashboards.conf`
  - `/etc/dokploy/traefik/dynamic/dokploy.yml`
  - `/etc/dokploy/traefik/dynamic/compose-caudals-umami-znhrpr.yml`
  - `/etc/dokploy/compose/caudals-umami-znhrpr/code/docker-compose.yml`
