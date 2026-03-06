# 2026-03-06 - Validation: Production Deploy Routing Drift

## Scope
- Confirm which service public domains route to.
- Compare running image digests and Next.js build IDs across services.
- Verify public domains serve latest build after runtime update.

## Checks Performed
- Server service/runtime inspection:
  - `docker ps`
  - `docker service ls`
  - `docker service ps web-l0qily`
  - `docker service ps caudalsdep-caudals-vgbvxp`
  - `docker inspect <container>`
  - `docker image inspect mariomedpar/caudals:latest`
- Traefik routing config inspection:
  - `/etc/dokploy/traefik/dynamic/web-l0qily.yml`
  - `/etc/dokploy/traefik/dynamic/caudalsdep-caudals-vgbvxp.yml`
- Build artifact probes:
  - `curl https://<domain>/_next/static/<BUILD_ID>/_buildManifest.js`

## Before Hotfix
- `web-l0qily` image digest: `sha256:3413785ca7bf...` (older).
- `caudalsdep-caudals-vgbvxp` image digest: `sha256:087b4ebca203...` (latest).
- Public domains returned `200` for old build manifest and `404` for latest build manifest.

## Hotfix
- `docker service update --force web-l0qily`

## After Hotfix
- `web-l0qily` image digest: `sha256:087b4ebca203...` (matches latest).
- `web-l0qily` BUILD_ID matches latest BUILD_ID.
- `https://caudals.com/_next/static/<latest_BUILD_ID>/_buildManifest.js` => `200`
- `https://app.caudals.com/_next/static/<latest_BUILD_ID>/_buildManifest.js` => `200`

## Conclusion
Deployment mismatch resolved. Live traffic now serves the latest built image.
