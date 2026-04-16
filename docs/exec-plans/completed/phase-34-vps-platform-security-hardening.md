# Phase 34 - VPS and Platform Security Hardening

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-04-03

## Goal
- Eliminate confirmed public exposure and secret-handling risks across the DigitalOcean VPS, self-hosted Supabase stack, Dokploy runtime, and deployment pipeline without breaking the Caudals production app.

## Exit Criteria
- Public internet exposure is reduced to required production entrypoints only.
- Raw Supabase admin/studio/database/pooler/control-plane ports are no longer reachable from the public internet.
- SSH password access remains disabled and SSH is restricted to Tailscale-only access.
- Repo and deploy config no longer expose secret-debug tooling or bake server secrets into Docker image build layers.
- Audit findings, changes, and validation evidence are documented in `docs/`.

## Queue
- Queue Position: completed
- Blocking Dependencies: none

## Scope Context
- Confirmed public exposures at audit start on `161.35.200.8`: `22`, `80`, `443`, `3000`, `3001`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946/tcp`.
- `supabase.caudals.com` served Supabase Studio publicly on `/`, while API paths routed to Kong.
- UFW was inactive and Docker-published ports were bound on `0.0.0.0`.
- Dokploy was publicly reachable on `:3000`.
- The app image received server secrets through Docker build args and runtime image `ENV`.
- Tailscale was absent from the host at audit start.

## Stages

### S1 - Audit and Attack Surface Mapping
- Objective: Establish a precise inventory of public exposure, secret surfaces, and deployment/runtime weaknesses.
- Outputs: Host/service exposure inventory, repo/runtime secret-handling findings, remediation sequence.
- Done when: Confirmed findings are captured in this phase file and guide implementation order.
- Mapped Tasks: `P34-T01`

### S2 - Host and Network Hardening
- Objective: Remove unnecessary public reachability and enforce a default-deny perimeter around the VPS.
- Outputs: Firewall policy, local-only/internal-only service bindings, reduced public port surface, SSH posture updates, supporting host safeguards.
- Done when: Only required public entrypoints remain reachable and raw admin/data-plane ports are closed from the internet.
- Mapped Tasks: `P34-T02`, `P34-T03`

### S3 - Platform and Deployment Hardening
- Objective: Remove platform-side debug/secret exposure risks and tighten deployment secret handling.
- Outputs: Removed or hardened debug endpoints/tools, Docker/deploy workflow changes, updated runtime/security docs.
- Done when: Server secrets are runtime-injected only, not build-baked, and no debug secret surface remains in the shipped app.
- Mapped Tasks: `P34-T04`, `P34-T05`

### S4 - Validation and Documentation
- Objective: Prove the hardening state from both local/repo and external/runtime perspectives.
- Outputs: Validation logs, changelog entry, updated plan state, completed operating docs.
- Done when: Evidence is written and the phase record is archived.
- Mapped Tasks: `P34-T06`

## Tasks
- [x] `P34-T01` (P0, DONE, owner: agent) Audit the VPS, public network surface, reverse-proxy routing, and repo/deploy secret-handling paths; record confirmed findings and remediation targets.
- [x] `P34-T02` (P0, DONE, owner: agent) Harden host/network exposure with firewall rules and service-binding changes so only required public web entrypoints remain reachable.
- [x] `P34-T03` (P0, DONE, owner: agent) Install and configure Tailscale, prepare SSH for Tailscale-only access, and keep password logins disabled throughout.
- [x] `P34-T04` (P0, DONE, owner: agent) Remove risky debug and privileged diagnostic surfaces from the application/runtime path.
- [x] `P34-T05` (P0, DONE, owner: agent) Stop embedding server secrets into Docker build layers and align deployment/runtime configuration with least-privilege secret handling.
- [x] `P34-T06` (P0, DONE, owner: agent) Validate externally and internally, then update changelog, validation evidence, and final operating docs.

## Subtasks (Optional)
- [x] `P34-T02-S01` Capture and back up current Supabase and Dokploy reverse-proxy/compose configs before mutation.
- [x] `P34-T02-S02` Restrict Supabase Studio, Kong raw ports, pooler ports, and Dokploy admin to localhost or trusted interfaces only.
- [x] `P34-T02-S03` Enforce default-deny inbound policy for Docker-exposed ports, including Docker Swarm control-plane ports.
- [x] `P34-T03-S01` Install Tailscale packages and service without locking out the active SSH session.
- [x] `P34-T03-S02` After node authorization, limit SSH ingress to `tailscale0` and disable public TCP/22 ingress.
- [x] `P34-T05-S01` Update Dockerfile and GitHub Actions workflow so only public build-time vars are passed during build.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- external reachability checks for hardened ports and routes
- host-level service and firewall verification on the VPS

## Evidence Links
- Changelog: `docs/logs/changelog/2026-04-03-phase-34-vps-platform-security-hardening.md`
- Validation: `docs/logs/validations/2026-04-03-phase-34-vps-platform-security-hardening.md`

## Mid-Execution Steering Notes
- Keep the user-facing app and required public API paths online while reducing host exposure.
- Prefer Tailscale/private administration paths over raw public host access.

## Execution Notes
- Confirmed pre-hardening public exposure from the internet: `22`, `80`, `443`, `3000`, `3001`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946/tcp`.
- Confirmed pre-hardening routing issue: `https://supabase.caudals.com/` served Supabase Studio publicly and `http://161.35.200.8:3001/project/default` returned `200`.
- Confirmed pre-hardening secret-handling issue: production image build pipeline passed server secrets as Docker build args and baked them into image `ENV`, while Dokploy runtime env storage for the app was empty.
- Completed host hardening:
  - rebound Supabase raw ports (`3001`, `4000`, `5432`, `6543`, `8000`, `8443`) to `127.0.0.1`,
  - removed public Studio routing from `supabase.caudals.com/`,
  - enabled UFW default-deny inbound posture,
  - enforced explicit Docker/Swarm drop rules for `3000`, `3001`, `4000`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946`, `4789`,
  - hardened SSH to publickey-only auth, locked the root password, and enabled fail2ban,
  - installed and authorized Tailscale, enabled SSH on `tailscale0`, and removed public `22/tcp`.
- Completed host stability hardening:
  - added a persistent `4G` swapfile and boot persistence in `/etc/fstab`,
  - applied `vm.swappiness=10` and `vm.vfs_cache_pressure=50`,
  - capped journald storage and reduced journal usage to `391.1M`,
  - pruned unused Docker images to recover disk headroom,
  - tightened `/root/.ssh` and `/supabase/supabase/docker/.env*` permissions.
- Completed repo/deploy hardening:
  - deleted public debug API routes and Stripe debug UI,
  - removed the unused `debug_tools` service-role scope,
  - removed server-secret build args and runtime image `ENV` injection from `Dockerfile` and `.github/workflows/deploy.yml`,
  - seeded Dokploy-stored runtime env records from the current production container so future redeploys are not forced to depend on image-baked secrets.

## Blockers
- None.
