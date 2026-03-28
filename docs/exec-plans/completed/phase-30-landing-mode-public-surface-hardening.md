# Phase 30 - LANDING_MODE Public Surface Hardening

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-28

## Goal
- Replace the legacy LANDING_MODE experiment with a production-grade allowlist that publishes only the primary landing page, blog, and contact surface while hiding the rest of the application.

## Exit Criteria
- `LANDING_MODE=true` exposes only `/`, `/contact`, `/blog`, and `/blog/*` plus required assets and explicitly allowed public APIs.
- `/landing-simple` is removed from the codebase and routing model.
- The old public partnerships route (`/collaborate`) is removed and the public contact experience is served from `/contact`.
- Header, footer, and landing CTAs no longer point to blocked routes while LANDING_MODE is enabled.
- Deployment docs specify where the flag must be set so build-time and runtime behavior stay aligned.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- Current LANDING_MODE logic is a redirect-heavy prototype that rewrites most traffic to `/landing-simple`, which duplicates the primary landing and blocks blog/contact flows.
- Production deployment currently serves all public hostnames from one Dokploy service, so LANDING_MODE must harden route access at the app edge rather than rely on Git branching alone.
- The public contact form is currently implemented as a partnerships flow under `/collaborate`; the public route and copy need to be normalized to contact-oriented language.

## Stages

### S1 - Routing and Flag Hardening
- Objective: Replace the prototype redirect behavior with a reusable LANDING_MODE allowlist for routes and APIs.
- Outputs: shared landing-mode helpers, proxy enforcement, obsolete route removal.
- Done when: blocked pages and APIs return 404 under LANDING_MODE while allowed routes still render correctly.
- Mapped Tasks: `P30-T01`, `P30-T02`

### S2 - Public Contact Surface Consolidation
- Objective: Rename the public partnerships surface to contact and ensure all public navigation and CTAs align with the restricted surface.
- Outputs: `/contact` form experience, landing CTA updates, header/footer cleanup, `/collaborate` removal.
- Done when: no public UI in the allowed surface references partnerships or blocked routes.
- Mapped Tasks: `P30-T03`, `P30-T04`

### S3 - Validation and Deployment Guidance
- Objective: Validate the new behavior and document how to activate LANDING_MODE in the existing GitHub Actions -> Docker Hub -> Dokploy flow.
- Outputs: validation evidence, docs updates, changelog entry.
- Done when: tests/checks pass and docs explain build-time plus runtime flag handling.
- Mapped Tasks: `P30-T05`, `P30-T06`

## Tasks
- [x] `P30-T01` (P0, DONE, owner: agent) Introduce a shared LANDING_MODE allowlist for public pages, public APIs, and metadata/assets.
- [x] `P30-T02` (P0, DONE, owner: agent) Replace legacy `/landing-simple` redirect behavior and remove the duplicate route from the codebase.
- [x] `P30-T03` (P0, DONE, owner: agent) Move the public contact form surface from `/collaborate` to `/contact` and remove partnerships-first public copy.
- [x] `P30-T04` (P1, DONE, owner: agent) Update landing, header, footer, and public CTAs so LANDING_MODE never points users to blocked routes.
- [x] `P30-T05` (P0, DONE, owner: agent) Add or update automated coverage for landing-mode route allowlisting and the renamed public route.
- [x] `P30-T06` (P1, DONE, owner: agent) Update architecture/tooling docs and add dated changelog + validation evidence for LANDING_MODE activation.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- runtime/manual checks relevant to LANDING_MODE public routing

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-28-phase-30-landing-mode-public-surface.md`
- Validation: `docs/logs/validations/2026-03-28-phase-30-landing-mode-public-surface-validation.md`

## Mid-Execution Steering Notes
- Keep LANDING_MODE host-agnostic so a single production service still hides app/auth/product routes correctly.
- Treat Git branches as deployment workflow only; route visibility must be enforced in-app.
