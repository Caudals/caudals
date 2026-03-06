# 2026-03-06 - Production Deploy Routing Drift Investigation

## Summary
Investigated mismatch between local/latest build output and what was visible on public domains. Root cause was deployment target drift: the live domains were routed to a different Swarm service than the one auto-updated by image pushes.

## Findings
- `Build and Push Docker image` was succeeding and publishing the latest image digest.
- VPS had two app services:
  - `caudalsdep-caudals-vgbvxp` running the new digest.
  - `web-l0qily` still running an older digest.
- Traefik dynamic config files under `/etc/dokploy/traefik/dynamic/` routed:
  - `app.caudals.com` and `www.app.caudals.com` to `web-l0qily`.
  - `caudals.com` appeared in both `web-l0qily.yml` and `caudalsdep-caudals-vgbvxp.yml` (routing ambiguity).
- Public domains resolved to the old build manifest until `web-l0qily` was updated.

## Runtime Hotfix Applied
- Forced rollout of the actually routed service:
  - `docker service update --force web-l0qily`
- Verified service image and build ID now match latest digest.

## Outcome
- `caudals.com` and `app.caudals.com` now serve the latest build artifact.
