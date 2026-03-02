# Phase 13 - App Dashboard Refactor (Requester, Contributor, Admin)

- Status: COMPLETED
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
- [x] `P13-T02` (P0, DONE) Fix shared shell defects (role switcher behavior, active section highlighting, role-view routing consistency).
- [x] `P13-T03` (P0, DONE) Refactor requester dashboard and requester sections end-to-end for market-ready UX.
- [x] `P13-T04` (P1, DONE) Refactor contributor dashboard and contributor sections for consistent app-shell UX.
- [x] `P13-T05` (P1, DONE) Refactor admin dashboard and admin section IA/UX consistency.
- [x] `P13-T06` (P0, DONE) Run cross-role QA validation and finalize phase evidence logs.

## Subtasks

- [x] `P13-T01-S01` Create role blueprint file with sections, menus, and core flows.
- [x] `P13-T02-S01` Normalize sidebar route matching for path + query.
- [x] `P13-T02-S02` Ensure admin role-switch can view contributor/requester surfaces without accidental redirects.
- [x] `P13-T03-S01` Rework requester sidebar menu grouping and utility links.
- [x] `P13-T03-S02` Refactor requester pages (`overview`, `datasets`, `analytics`, `billing`, `files`, `support`, `onboarding`, `settings`) for consistency.
- [x] `P13-T03-S03` Ensure dataset and support workflows have clear primary actions and statuses.
- [x] `P13-T06-S01` Run `typecheck`, targeted lint/tests, and update logs.
- [x] `P13-T04-S01` Refactor contributor pages (`overview`, `contributions`, `earnings`, `settings`) with cohesive role header UX and action flows.
- [x] `P13-T05-S01` Refactor admin pages (`overview`, `requests`, `submissions`, `datasets`, `payments`, `support`, `users`, `analytics`, `activity`, `featured`, `settings`) with consistent IA framing.
- [x] `P13-T06-S02` Run cross-role manual QA via DevTools MCP and capture screenshot evidence for requester/contributor/admin surfaces.

## Validation Required

- `npm run typecheck`
- targeted lint/tests for touched dashboard + shell files
- app shell and cross-role route manual QA checks

## Evidence Links

- Design blueprint: `docs/design-docs/dashboard-role-blueprints.md`
- Changelog: `docs/logs/changelog/2026-03-02-app-dashboard-refactor.md`
- Validation: `docs/logs/validations/2026-03-02-app-dashboard-refactor-validation.md`
