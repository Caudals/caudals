# Phase 11 - Autonomous Agent Runtime

- Status: IN_PROGRESS
- Priority: P0
- Owner: autonomous-agent
- Last Updated: 2026-03-02

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
- [ ] `P11-T02` (P0, IN_PROGRESS) Add a standardized per-task validation checklist template and enforce usage in active phases.
- [ ] `P11-T03` (P0, QUEUED) Define mandatory UI verification protocol with Chrome DevTools MCP screenshot evidence for frontend tasks.
- [ ] `P11-T04` (P1, QUEUED) Add explicit blocker/escalation protocol and retry strategy for long-running tasks.
- [ ] `P11-T05` (P1, QUEUED) Create an autonomous feature-delivery pilot task and run full loop from planning to evidence logging.
- [ ] `P11-T06` (P1, QUEUED) Add lightweight weekly planning reset cadence to prevent stale queues.

## Subtasks
- [ ] `P11-T02-S01` Define template sections: commands, screenshots, runtime checks, risk notes.
- [ ] `P11-T02-S02` Add template link in `AGENTS.md` and `docs/PLAN.md`.
- [ ] `P11-T03-S01` Specify required viewport set: mobile, tablet, desktop.
- [ ] `P11-T03-S02` Define screenshot naming convention by task ID and date.
- [ ] `P11-T05-S01` Select one P1 product enhancement for pilot.
- [ ] `P11-T05-S02` Execute pilot and publish complete evidence package.

## Validation Required
- `npm run typecheck`
- targeted tests/lint for touched areas
- docs consistency checks (all references resolve)

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-02-harness-refactor.md`
- Validation: `docs/logs/validations/2026-03-02-doc-harness-validation.md`
