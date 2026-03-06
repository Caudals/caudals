# 2026-03-06 - Dokploy Single-Service Hardening

## Summary
Eliminated production deployment drift by consolidating all public app domains onto the single active Dokploy application service and removing the stale legacy service path.

## Root Cause
- Docker image pushes from `main` updated `caudalsdep-caudals-vgbvxp`.
- Public traffic for `app.caudals.com`/`www.app.caudals.com` was still routed via stale Traefik config to legacy service `web-l0qily`.
- Result: deployments succeeded, but web traffic could remain on an older app image.

## Changes Applied (VPS)
- Added missing domain bindings in Dokploy DB for active application `cTfps4G8LIv8QiIQm8udk`:
  - `www.caudals.com`
  - `app.caudals.com`
  - `www.app.caudals.com`
- Backed up and replaced `/etc/dokploy/traefik/dynamic/caudalsdep-caudals-vgbvxp.yml` with all four hosts routed to `caudalsdep-caudals-vgbvxp:3000`.
- Removed stale Traefik file `/etc/dokploy/traefik/dynamic/web-l0qily.yml` (backup retained).
- Removed stale Swarm service `web-l0qily`.

## Outcome
- Only one production app service remains (`caudalsdep-caudals-vgbvxp`).
- All production domains now resolve to that single service.
- Future `main` image updates apply to the exact service receiving traffic.
