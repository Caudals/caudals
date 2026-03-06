# 2026-03-06 - Validation: Dokploy Single-Service Hardening

## Scope
- Ensure there is only one active production application service.
- Ensure all production domains route to the same service/build.
- Ensure stale legacy routing/service path is removed.

## Evidence Collected

### 1) Dokploy metadata (DB)
- `application` table: single active app `caudalsdep-caudals-vgbvxp` (`applicationId=cTfps4G8LIv8QiIQm8udk`).
- `domain` table for this app includes:
  - `caudals.com`
  - `www.caudals.com`
  - `app.caudals.com`
  - `www.app.caudals.com`

### 2) Runtime services
- `docker service ls` after cleanup:
  - `caudalsdep-caudals-vgbvxp` present
  - `web-l0qily` removed

### 3) Routing config
- Active dynamic file:
  - `/etc/dokploy/traefik/dynamic/caudalsdep-caudals-vgbvxp.yml` routes all four hosts.
- Stale file removed:
  - `/etc/dokploy/traefik/dynamic/web-l0qily.yml` (backup retained as `.bak-*`).

### 4) Public domain checks (build manifest probe)
- `https://caudals.com/_next/static/<active_BUILD_ID>/_buildManifest.js` => `200`
- `https://www.caudals.com/_next/static/<active_BUILD_ID>/_buildManifest.js` => `200`
- `https://app.caudals.com/_next/static/<active_BUILD_ID>/_buildManifest.js` => `200`
- `https://www.app.caudals.com/_next/static/<active_BUILD_ID>/_buildManifest.js` => `200`

## Conclusion
Production deployment path is now single-target and deterministic: pushes to `main` update the same service that serves all public app domains.
