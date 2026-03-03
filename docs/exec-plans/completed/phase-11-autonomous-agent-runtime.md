# Phase 11 - Autonomous Agent Runtime

- Status: DONE
- Priority: P0
- Owner: autonomous-agent
- Last Updated: 2026-03-03

## Goal
Harden Caudals so agents can autonomously plan, implement, validate, and continue work without supervision drift.

## Exit Criteria
- Planning artifacts are consistently maintained across sessions.
- Validation evidence is generated for every completed task.
- Agent loop quality is measurable through reliability and quality score signals.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Tasks
- [x] `P11-T01` (P0, DONE) Refactor harness documentation architecture and phase-based planning structure.
- [x] `P11-T02` (P0, DONE) Add a standardized per-task validation checklist template and enforce usage in active phases.
- [x] `P11-T03` (P0, DONE) Define mandatory UI verification protocol with Chrome DevTools MCP screenshot evidence for frontend tasks.
- [x] `P11-T04` (P1, DONE) Add explicit blocker/escalation protocol and retry strategy for long-running tasks.
- [x] `P11-T05` (P1, DONE) Create an autonomous feature-delivery pilot task and run full loop from planning to evidence logging.
- [x] `P11-T06` (P1, DONE) Add lightweight weekly planning reset cadence to prevent stale queues.

## Subtasks
- [x] `P11-T02-S01` Define template sections: commands, screenshots, runtime checks, risk notes.
- [x] `P11-T02-S02` Add template link in `AGENTS.md` and `docs/PLAN.md`.
- [x] `P11-T03-S01` Specify required viewport set: mobile, tablet, desktop.
- [x] `P11-T03-S02` Define screenshot naming convention by task ID and date.
- [x] `P11-T03-S03` Add fallback rule for temporary MCP transport outages with explicit validation logging.
- [x] `P11-T04-S01` Define blocker classes and bounded retry sequence for long-running work.
- [x] `P11-T04-S02` Define blocker escalation record format across active phase + logs.
- [x] `P11-T04-S03` Link protocol in `AGENTS.md` and `docs/PLAN.md`.
- [x] `P11-T05-S01` Select one P1 product enhancement for pilot (`P12` dashboard shell/menu refactor).
- [x] `P11-T05-S02` Execute pilot and publish complete evidence package.
- [x] `P11-T06-S01` Define weekly reset cadence + checklist for queue hygiene.
- [x] `P11-T06-S02` Link weekly reset cadence in global planning docs.

## Validation Required
- `npm run typecheck`
- targeted tests/lint for touched areas
- docs consistency checks (all references resolve)

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-02-harness-refactor.md`
- Validation: `docs/logs/validations/2026-03-02-doc-harness-validation.md`
- Changelog (Phase 11 continuation): `docs/logs/changelog/2026-03-03-phase-11-12-dashboard-review.md`
- Validation (Phase 11 continuation): `docs/logs/validations/2026-03-03-phase-11-12-dashboard-review-validation.md`
- Changelog (Phase 11 completion): `docs/logs/changelog/2026-03-03-phase-11-runtime-hardening.md`
- Validation (Phase 11 completion): `docs/logs/validations/2026-03-03-phase-11-runtime-hardening-validation.md`
