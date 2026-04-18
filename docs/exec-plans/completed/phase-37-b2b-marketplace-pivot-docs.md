# Phase 37 - B2B Marketplace Pivot Documentation

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-04-18

## Goal
Pivot canonical documentation from the retired individual-upload dataset marketplace to the new B2B AI dataset marketplace and managed dataset build model.

## Exit Criteria
- `AGENTS.md` and docs read order point to `docs/ARCHITECTURE.md`.
- Product specs describe buyer companies, supplier companies, Caudals-operated dataset builds, service tiers, and private admin operations.
- Design docs match the current landing page visual system.
- Obsolete role workflow and dashboard-role blueprint docs are removed or replaced.
- Active planning no longer queues old requester/contributor dashboard work.
- Validation logs record reference checks.

## Stages

### S1 - Canonical Docs Pivot
- Objective: Rewrite product, architecture, design, frontend, security, schema, and tooling docs.
- Mapped Tasks: `P37-T01`, `P37-T02`, `P37-T03`

### S2 - Planning and Evidence Cleanup
- Objective: Remove obsolete active docs, archive completed active docs, and add delivery evidence.
- Mapped Tasks: `P37-T04`, `P37-T05`

## Tasks
- [x] `P37-T01` (P0, DONE, owner: agent) Update `AGENTS.md`, `docs/index.md`, `docs/PLAN.md`, and `docs/ARCHITECTURE.md` for the B2B marketplace pivot.
- [x] `P37-T02` (P0, DONE, owner: agent) Replace old product specs with marketplace operations and service tier specs.
- [x] `P37-T03` (P0, DONE, owner: agent) Update design/frontend/security/tooling/schema docs for current landing-mode scope and future admin operations.
- [x] `P37-T04` (P1, DONE, owner: agent) Remove obsolete active role-dashboard work and archive completed active phases.
- [x] `P37-T05` (P1, DONE, owner: agent) Add changelog and validation evidence.

## Validation Required
- Canonical-doc reference scan for retired requester/contributor docs.
- Root markdown location check confirms architecture moved under `docs/`.
- `npm run typecheck` for repo health after doc-only changes.

## Evidence Links
- Changelog: `docs/logs/changelog/2026-04-18-b2b-marketplace-pivot-docs.md`
- Validation: `docs/logs/validations/2026-04-18-b2b-marketplace-pivot-docs-validation.md`

## Notes
- Historical completed phase files and logs remain immutable records of the old product.
- `TD-011` tracks the remaining code/schema replatforming work required before relaunching marketplace self-service.
