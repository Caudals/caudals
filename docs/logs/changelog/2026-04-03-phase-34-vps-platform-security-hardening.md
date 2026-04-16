# 2026-04-03 - Phase 34 VPS and Platform Security Hardening

## Summary
- Opened and prioritized Phase 34 to address confirmed VPS and platform security issues.
- Audited the live DigitalOcean host, reverse-proxy layout, Supabase stack, Dokploy runtime, and deployment secret-handling path.
- Completed the hardening pass so only `80` and `443` remain reachable from the public internet.

## Host Changes
- Rebound raw Supabase ports to localhost only:
  - Studio `3001`
  - Analytics `4000`
  - Pooler `5432`, `6543`
  - Kong `8000`, `8443`
- Removed the public Studio route from `supabase.caudals.com/`; only API path prefixes now route to Kong.
- Enabled UFW with default-deny inbound posture.
- Added persistent Docker/Swarm firewall drops for `3000`, `3001`, `4000`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946`, `4789`.
- Hardened SSH with explicit publickey-only authentication, locked the root password, and enabled fail2ban.
- Installed and authorized Tailscale, enabled SSH on `tailscale0`, and removed public `22/tcp`.
- Added a persistent `4G` swapfile, lowered `vm.swappiness`, reduced `vm.vfs_cache_pressure`, and capped journald storage to keep the VPS administrable under memory pressure.
- Pruned unused Docker images and tightened `/root/.ssh` plus Supabase `.env*` file permissions to `600`/`700`.

## Repo and Deploy Changes
- Deleted public debug API routes under `app/(app)/api/debug/*`.
- Deleted the unused Stripe debug UI component.
- Removed the unused `debug_tools` service-role scope.
- Updated `Dockerfile` and `.github/workflows/deploy.yml` so server-side secrets are no longer passed as Docker build args or baked into final image `ENV`.
- Updated the Stripe verification script to validate that the public debug endpoint is absent instead of expecting it.
- Seeded Dokploy-stored app/environment env records from the current production container so future redeploys are not forced to depend on image-baked secrets.

## Residual Follow-Up
- Treat credentials present in older image builds as at-risk and rotate them after the new image path is deployed, starting with Stripe secrets, the Supabase service-role key, and Resend credentials.
