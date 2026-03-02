# Phase 13 - App Dashboard Refactor (Requester, Contributor, Admin)

- Status: IN_PROGRESS
- Priority: P0
- Owner: autonomous-agent
- Last Updated: 2026-03-02

## Goal
Refactor `app.caudals.com` into a coherent, production-ready multi-role app shell and dashboard system with reliable navigation, stable role views, and polished UI/UX.

## Exit Criteria
- Shared app shell behavior is stable (role switcher + active states + navigation consistency).
- Requester dashboard and all requester sections are functionally complete and visually cohesive.
- Contributor and admin dashboard sections are refactored to same quality bar.
- Validation evidence exists for each completed task.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Tasks
- [x] `P13-T01` (P0, DONE) Define role blueprints and dashboard IA contracts for requester/contributor/admin.
- [ ] `P13-T02` (P0, IN_PROGRESS) Fix shared shell defects (role switcher behavior, active section highlighting, role-view routing consistency).
- [ ] `P13-T03` (P0, IN_PROGRESS) Refactor requester dashboard and requester sections end-to-end for market-ready UX.
- [ ] `P13-T04` (P1, QUEUED) Refactor contributor dashboard and contributor sections for consistent app-shell UX.
- [ ] `P13-T05` (P1, QUEUED) Refactor admin dashboard and admin section IA/UX consistency.
- [ ] `P13-T06` (P0, QUEUED) Run cross-role QA validation and finalize phase evidence logs.

## Subtasks
- [x] `P13-T01-S01` Create role blueprint file with sections, menus, and core flows.
- [ ] `P13-T02-S01` Normalize sidebar route matching for path + query.
- [ ] `P13-T02-S02` Ensure admin role-switch can view contributor/requester surfaces without accidental redirects.
- [ ] `P13-T03-S01` Rework requester sidebar menu grouping and utility links.
- [ ] `P13-T03-S02` Refactor requester pages (`overview`, `datasets`, `analytics`, `billing`, `files`, `support`, `onboarding`, `settings`) for consistency.
- [ ] `P13-T03-S03` Ensure dataset and support workflows have clear primary actions and statuses.
- [ ] `P13-T06-S01` Run `typecheck`, targeted lint/tests, and update logs.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched requester + shell files
- app shell and requester route manual QA checks

## Evidence Links
- Design blueprint: `docs/design-docs/dashboard-role-blueprints.md`
- Changelog: `docs/logs/changelog/2026-03-02-app-dashboard-refactor.md`
- Validation: `docs/logs/validations/2026-03-02-app-dashboard-refactor-validation.md`
