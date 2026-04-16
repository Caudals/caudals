# Phase 35 - Private Dashboard and Admin Surface Hardening

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-04-03

## Goal
- Remove any remaining internet-exposed dashboard or admin surfaces from the VPS while preserving required public service endpoints and documenting the new private access model.

## Exit Criteria
- Dokploy and Umami dashboards are no longer reachable from the public internet.
- Required public service functionality remains available after the routing changes.
- Any other similar public admin/dashboard surfaces discovered on the VPS are hardened or documented as intentionally public with justification.
- Access instructions for private dashboards are documented in `docs/`.

## Queue
- Queue Position: completed
- Blocking Dependencies: none

## Scope Context
- `dokploy.caudals.com` served the Dokploy login UI publicly over HTTPS at audit start.
- `analytics.caudals.com` served the Umami UI publicly over HTTPS at audit start.
- The product still depends on `https://analytics.caudals.com/script.js`, so analytics collection had to stay public even after the dashboard was removed.
- Additional live route audit found a public Umami `traefik.me` alias over HTTP and a stale preview `traefik.me` route returning `502`.
- Phase 34 had already closed public host ports and moved SSH to Tailscale-only; this phase focused on HTTPS-routed admin surfaces.

## Stages

### S1 - Public Admin Surface Audit
- Objective: Inventory public HTTPS-routed dashboards/admin panels and distinguish them from required public service endpoints.
- Outputs: Confirmed route inventory, service ownership map, remediation targets.
- Done when: Publicly exposed admin/dashboard surfaces are identified and recorded in this phase file.
- Mapped Tasks: `P35-T01`

### S2 - Private Routing Hardening
- Objective: Move dashboards/admin UIs behind Tailscale/private access while preserving required service functionality.
- Outputs: Updated routing/proxy configuration, verified private access paths, preserved public collectors where needed.
- Done when: Internet-facing admin dashboards are no longer public and dependent services still work.
- Mapped Tasks: `P35-T02`, `P35-T03`

### S3 - Validation and Runbook Update
- Objective: Prove the new access model works and document how to operate the private dashboards safely.
- Outputs: Validation evidence, changelog, updated tools/security docs, dashboard access instructions.
- Done when: Evidence is written and access instructions are clear.
- Mapped Tasks: `P35-T04`

## Tasks
- [x] `P35-T01` (P0, DONE, owner: agent) Audit all publicly routed VPS services for dashboard/admin exposure and classify which endpoints must remain public.
- [x] `P35-T02` (P0, DONE, owner: agent) Move Dokploy behind Tailscale/private access only and verify deployment functionality remains intact.
- [x] `P35-T03` (P0, DONE, owner: agent) Move Umami dashboard behind Tailscale/private access while preserving the required public analytics collection endpoint.
- [x] `P35-T04` (P0, DONE, owner: agent) Validate the new routing/access posture and document the dashboard access workflow plus any additional surfaces remediated.

## Subtasks (Optional)
- [x] `P35-T01-S01` Inspect Traefik/Dokploy routing config and container labels for all public hostnames on the VPS.
- [x] `P35-T01-S02` Probe known public hostnames and direct routes to confirm which ones expose admin UIs.
- [x] `P35-T03-S01` Confirm whether `analytics.caudals.com/script.js` must stay public for the product site.

## Validation Required
- external HTTPS reachability checks for affected hostnames/routes
- host-level proxy/container verification on the VPS
- targeted app/runtime checks for analytics collection if touched

## Evidence Links
- Changelog: `docs/logs/changelog/2026-04-03-phase-35-private-dashboard-and-admin-surface-hardening.md`
- Validation: `docs/logs/validations/2026-04-03-phase-35-private-dashboard-and-admin-surface-hardening.md`

## Mid-Execution Steering Notes
- Preserve required public app/API/collector endpoints.
- Prefer Tailscale-only admin access over password-protected public login pages.

## Execution Notes
- Confirmed live public admin/dashboard exposure at audit start:
  - `https://dokploy.caudals.com/` served the Dokploy login UI.
  - `https://analytics.caudals.com/` served the Umami dashboard UI.
  - `http://caudals-umami-0f16f8-161-35-200-8.traefik.me/` served the Umami UI publicly.
  - `http://preview-web-l0qily-9sy1cp-161-35-200-8.traefik.me/` exposed a stale route with `502 Bad Gateway`.
- Confirmed route inventory after inspecting Dokploy-managed Traefik files:
  - public app hosts: `caudals.com`, `www.caudals.com`, `app.caudals.com`, `www.app.caudals.com`
  - required public analytics collector host: `analytics.caudals.com` limited to `/script.js` and `/api/send`
  - required public Supabase API host: `supabase.caudals.com` limited to API paths
  - private-only local hostnames: `dokploy.docker.localhost`, `umami.docker.localhost`
- Completed routing hardening:
  - removed the public Dokploy route from `/etc/dokploy/traefik/dynamic/dokploy.yml`,
  - restricted `analytics.caudals.com` to public collector paths only,
  - removed the public Umami `traefik.me` alias,
  - disabled the stale preview route file,
  - updated `/etc/dokploy/compose/caudals-umami-znhrpr/code/docker-compose.yml` so future Umami route generation preserves the collector-only/public plus dashboard-private split.
- Completed private access workflow:
  - added `scripts/tailscale-dashboard-tunnel.sh`,
  - documented access in `docs/private-dashboard-access.md`,
  - validated local-only Traefik hostnames over SSH tunnels:
    - `http://dokploy.docker.localhost:<port>`
    - `http://umami.docker.localhost:<port>`

## Blockers
- None.
