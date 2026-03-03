# Phase 14 - Export Queue Reliability and Debt Closure

- Status: DONE
- Priority: P0
- Owner: autonomous-agent
- Last Updated: 2026-03-03

## Goal

Close the highest-impact reliability debt by moving dataset export generation to a durable queue worker flow and continue reducing critical operational debt from the tracker.

## Exit Criteria

- Dataset exports are processed through durable queued jobs (not synchronous requester action execution).
- Worker processing can run independently via script and protected internal API endpoint.
- Tech debt tracker statuses and target phases are accurate for completed and remaining items.
- Validation evidence exists for each completed task.

## Queue

- Queue Position: 1
- Blocking Dependencies: none

## Stages

### S1 - Export Queue Reliability Foundation
- Objective: decouple export lifecycle processing from synchronous requester action execution.
- Outputs: worker module, protected internal processing endpoint, and CLI processor wiring.
- Done when: queued exports can be processed independently and `TD-002` is closed with evidence.
- Mapped Tasks: `P14-T01`

### S2 - Test Fixture Stability Guardrails
- Objective: keep authenticated role smoke tests deterministic over time.
- Outputs: fixture freshness verification, auto-reseed behavior, workflow integration in auth smoke path.
- Done when: fixture freshness is checked automatically before auth smoke tests and `TD-004` is closed.
- Mapped Tasks: `P14-T02`

### S3 - Remaining Debt Hardening
- Objective: close remaining reliability and quality debt in abuse controls, observability, and localization QA.
- Outputs: distributed limiter, anomaly-correlation operational view, i18n missing-key CI guardrail.
- Done when: `TD-001`, `TD-003`, and `TD-005` are resolved with validation evidence.
- Mapped Tasks: `P14-T03`, `P14-T04`, `P14-T05`

## Tasks

- [x] `P14-T01` (P0, DONE) Implement durable export job worker flow and decouple export generation from requester action path.
- [x] `P14-T02` (P1, DONE) Add automated fixture freshness verification workflow for role E2E test stability (TD-004).
- [x] `P14-T03` (P1, DONE) Replace in-memory abuse limiter with durable distributed backing (TD-001).
- [x] `P14-T04` (P1, DONE) Add unified webhook+payout anomaly correlation operational view (TD-003, delivered in Phase 15 and validated).
- [x] `P14-T05` (P2, DONE) Add missing-key localization guardrail in CI for EN/ES parity (TD-005).

## Subtasks

- [x] `P14-T01-S01` Add export job processor module with queue claim, state transitions, and artifact upload.
- [x] `P14-T01-S02` Add protected internal API endpoint to process queued export jobs.
- [x] `P14-T01-S03` Add CLI job runner script for scheduled processing.
- [x] `P14-T01-S04` Refactor requester export action to enqueue and return without synchronous export build/upload.
- [x] `P14-T01-S05` Update docs/logs and debt tracker status for TD-002.
- [x] `P14-T02-S01` Refactor fixture seeding script to export reusable seed function.
- [x] `P14-T02-S02` Add fixture freshness check script with stale-detection + auto-reseed behavior.
- [x] `P14-T02-S03` Wire fixture freshness check into `e2e:auth-smoke` workflow and docs/env templates.
- [x] `P14-T04-S01` Validate debt closure handoff from Phase 15 anomaly tooling and update debt tracker status.
- [x] `P14-T03-S01` Inventory current abuse limiter callsites and define durable limiter storage contract.
- [x] `P14-T03-S02` Implement durable limiter backend (DB/Redis-backed) with atomic increment + TTL semantics.
- [x] `P14-T03-S03` Replace in-memory limiter callsites in auth/contact/risk-sensitive routes and keep equivalent error UX.
- [x] `P14-T03-S04` Add automated tests for limiter correctness under repeated/multi-key requests.
- [x] `P14-T03-S05` Update runbook/docs for abuse-limiter operations and incident handling.
- [x] `P14-T05-S01` Add translation key parity checker for EN/ES locale dictionaries.
- [x] `P14-T05-S02` Add CI command/script that fails on missing-key parity issues (orphan keys reported, strict mode optional).
- [x] `P14-T05-S03` Document localization QA workflow and add validation evidence template for i18n parity checks.

## Validation Required

- `npm run typecheck`
- targeted lint/tests for touched export, limiter, and i18n tooling files
- docs consistency checks (all references resolve)

## Evidence Links

- Changelog: `docs/logs/changelog/2026-03-03-phase-14-export-queue-reliability.md`
- Validation: `docs/logs/validations/2026-03-03-phase-14-export-queue-reliability-validation.md`
