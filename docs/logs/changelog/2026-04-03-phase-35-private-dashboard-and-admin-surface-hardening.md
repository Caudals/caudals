# 2026-04-03 - Phase 35 Private Dashboard and Admin Surface Hardening

## Summary
- Audited all Dokploy-managed public routes on the VPS for internet-exposed dashboard and admin surfaces.
- Removed public dashboard exposure for Dokploy and Umami while keeping required product and analytics collection endpoints online.
- Added a Tailscale-only access workflow for the private dashboards.

## Findings
- `dokploy.caudals.com` was publicly serving the Dokploy login UI.
- `analytics.caudals.com` was publicly serving the Umami dashboard UI.
- `http://caudals-umami-0f16f8-161-35-200-8.traefik.me/` exposed the Umami UI publicly.
- `http://preview-web-l0qily-9sy1cp-161-35-200-8.traefik.me/` was a stale public route returning `502 Bad Gateway`.

## Changes
- Rewrote `/etc/dokploy/traefik/dynamic/dokploy.yml` so the Dokploy dashboard is no longer routed on `dokploy.caudals.com`.
- Rewrote `/etc/dokploy/traefik/dynamic/compose-caudals-umami-znhrpr.yml` so `analytics.caudals.com` only serves `/script.js` and `/api/send` publicly.
- Added private-only local hostnames for dashboard access:
  - `dokploy.docker.localhost`
  - `umami.docker.localhost`
- Updated `/etc/dokploy/compose/caudals-umami-znhrpr/code/docker-compose.yml` so future Umami route generation preserves the private dashboard/public collector split.
- Disabled the stale preview route file `preview-web-l0qily-9sy1cp.yml`.
- Added `scripts/tailscale-dashboard-tunnel.sh` and `docs/private-dashboard-access.md` for private dashboard access over Tailscale SSH.

## Operating Model
- Public:
  - `https://caudals.com/`
  - `https://app.caudals.com/`
  - `https://supabase.caudals.com/<api-path>`
  - `https://analytics.caudals.com/script.js`
  - `https://analytics.caudals.com/api/send`
- Private only:
  - Dokploy dashboard
  - Umami dashboard

## Follow-Up
- If Dokploy or Umami are redeployed later, re-check the Traefik route files and rerun the public reachability validation to ensure the dashboards were not re-exposed.
