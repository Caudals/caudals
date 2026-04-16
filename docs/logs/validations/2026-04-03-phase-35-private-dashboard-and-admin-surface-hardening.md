# 2026-04-03 - Phase 35 Private Dashboard and Admin Surface Hardening Validation

## Scope
- Phase: `P35`
- Tasks validated: `P35-T01`, `P35-T02`, `P35-T03`, `P35-T04`

## Repo Validation
- [x] `bash -n scripts/tailscale-dashboard-tunnel.sh`
  - Result: PASS

## Host And Route Audit
- [x] Dokploy-managed route inventory reviewed from `/etc/dokploy/traefik/dynamic/*.yml`
  - Remaining public host rules after hardening:
    - `caudals.com`
    - `www.caudals.com`
    - `app.caudals.com`
    - `www.app.caudals.com`
    - `supabase.caudals.com` limited to API paths
    - `analytics.caudals.com` limited to `/script.js` and `/api/send`
  - Private-only local host rules after hardening:
    - `dokploy.docker.localhost`
    - `umami.docker.localhost`

## Public Reachability Validation
- [x] Main app hosts remain public and healthy
  - `https://caudals.com/` -> `HTTP/2 200`
  - `https://app.caudals.com/` -> `HTTP/2 200`
- [x] Dokploy dashboard removed from public internet
  - `https://dokploy.caudals.com/` -> `HTTP/2 404`
- [x] Umami dashboard removed from public internet
  - `https://analytics.caudals.com/` -> `HTTP/2 404`
- [x] Required public analytics collection still works
  - `https://analytics.caudals.com/script.js` -> `HTTP/2 200`
  - `https://analytics.caudals.com/api/send` with empty JSON -> `HTTP/2 400` (expected non-404 application response)
- [x] Additional public alias exposures removed
  - `http://caudals-umami-0f16f8-161-35-200-8.traefik.me/` -> `HTTP/1.1 404 Not Found`
  - `http://preview-web-l0qily-9sy1cp-161-35-200-8.traefik.me/` -> `HTTP/1.1 404 Not Found`

## Private Access Validation
- [x] Dokploy dashboard reachable privately through Tailscale tunnel
  - `scripts/tailscale-dashboard-tunnel.sh dokploy 23000`
  - `curl http://dokploy.docker.localhost:23000/` -> `HTTP/1.1 200 OK`
- [x] Umami dashboard reachable privately through Tailscale tunnel
  - `scripts/tailscale-dashboard-tunnel.sh umami 23001`
  - `curl http://umami.docker.localhost:23001/` -> `HTTP/1.1 200 OK`

## Notes
- Dokploy’s metadata database did not contain live `domain` records for `dokploy.caudals.com`, `analytics.caudals.com`, or the stale preview route; those exposures were controlled by Dokploy/Traefik route files and Umami compose labels instead.
- Backup of the live route/source files was stored on the VPS at `/root/security-backups/20260403-202559-phase35-admin-surfaces`.
