# Phase 36 - Direct Tailscale Dashboard Access

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-04-03

## Goal
- Replace SSH tunnel-based private dashboard access with direct Tailscale-only dashboard URLs and remove the temporary helper scripts.

## Exit Criteria
- Dokploy and Umami dashboards are directly reachable from devices on the tailnet without SSH tunnels.
- Dashboard ports are not reachable from the public internet.
- The old tunnel helper script is removed.
- Access instructions are updated to the final direct-access model.

## Queue
- Queue Position: completed
- Blocking Dependencies: none

## Scope Context
- Phase 35 removed the public Dokploy and Umami dashboards and used SSH tunnel helpers for private access.
- The preferred final operating model was direct access from the tailnet without local scripts.
- Tailscale Serve was checked but was not enabled on the tailnet, so the final implementation uses a host-native reverse proxy plus Tailscale-only firewall exposure.

## Stages

### S1 - Direct Access Design
- Objective: Choose and verify a direct access path that stays private to Tailscale.
- Outputs: Tailscale-only listener design, validation target URLs.
- Done when: The selected access model is ready for host implementation.
- Mapped Tasks: `P36-T01`

### S2 - Host Implementation
- Objective: Expose the dashboards directly on Tailscale-only ports while preserving private routing.
- Outputs: Host proxy config, firewall rules, removed helper script.
- Done when: Direct URLs work on the tailnet and are blocked publicly.
- Mapped Tasks: `P36-T02`, `P36-T03`

### S3 - Validation and Documentation
- Objective: Validate the final access model and update docs/logs.
- Outputs: Validation evidence, changelog, final access instructions.
- Done when: The new direct-access workflow is documented and the phase is archived.
- Mapped Tasks: `P36-T04`

## Tasks
- [x] `P36-T01` (P0, DONE, owner: agent) Finalize the direct Tailscale-only access design for Dokploy and Umami without relying on Tailscale Serve.
- [x] `P36-T02` (P0, DONE, owner: agent) Implement direct Tailscale-only listeners for Dokploy and Umami and verify private routing still works.
- [x] `P36-T03` (P0, DONE, owner: agent) Remove the obsolete SSH tunnel helper script and any outdated access guidance.
- [x] `P36-T04` (P0, DONE, owner: agent) Validate direct dashboard reachability from the tailnet, confirm public inaccessibility, and update docs/logs.

## Validation Required
- tailnet-side HTTP reachability checks for direct dashboard URLs
- public socket/HTTP checks confirming dashboard ports are not internet-accessible
- host-level config verification on the VPS

## Evidence Links
- Changelog: `docs/logs/changelog/2026-04-03-phase-36-direct-tailscale-dashboard-access.md`
- Validation: `docs/logs/validations/2026-04-03-phase-36-direct-tailscale-dashboard-access.md`

## Mid-Execution Steering Notes
- Prefer a host-native solution that survives reboot and does not require extra user-side setup beyond joining the tailnet.
- Keep the dashboards private even if future public routing changes occur elsewhere.

## Execution Notes
- Confirmed Tailscale Serve was not enabled on the tailnet, so it was not used for the final access model.
- Implemented a host-level Nginx reverse proxy on the VPS with fixed dashboard ports:
  - `7443` -> Dokploy
  - `7444` -> Umami
- The Nginx proxy forwards privately to Traefik on `127.0.0.1:80` using internal-only host headers:
  - `dokploy.docker.localhost`
  - `umami.docker.localhost`
- UFW now allows `7443/tcp` and `7444/tcp` only on `tailscale0`.
- Removed the old `scripts/tailscale-dashboard-tunnel.sh` helper and replaced the runbook with direct Tailscale URLs.

## Blockers
- None.
