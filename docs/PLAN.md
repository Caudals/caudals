# Caudals Master Plan

## Purpose
This is the global execution board for long-running autonomous delivery.

## Program State
- Historical delivery Phases 00-10 are completed and archived in `docs/exec-plans/completed/`.
- Current work is tracked as independent active phase files for better context-window efficiency.

## Queueing Rules
1. Work user-requested items first.
2. Continue with `IN_PROGRESS` tasks.
3. Then execute highest-priority unblocked `P0`, followed by `P1`, then `P2`.
4. Prefer tasks that unlock multiple downstream tasks.

## Active Phase Queue
| Queue | Phase | Status | Priority | Depends On | File |
| --- | --- | --- | --- | --- | --- |
| 1 | Phase 13 - App Dashboard Refactor | IN_PROGRESS | P0 | None | `docs/exec-plans/active/phase-13-app-dashboard-refactor.md` |
| 2 | Phase 11 - Autonomous Agent Runtime | IN_PROGRESS | P0 | None | `docs/exec-plans/active/phase-11-autonomous-agent-runtime.md` |
| 3 | Phase 12 - Market Readiness Expansion | QUEUED | P1 | Phase 11 | `docs/exec-plans/active/phase-12-market-readiness-expansion.md` |

## Planning Lifecycle
- Create one new file per new large phase in `docs/exec-plans/active/`.
- Use checkboxes and task IDs (`Pxx-Tnn`) for every task and subtask.
- Treat files in `docs/exec-plans/active/` as living execution documents while a phase is `IN_PROGRESS`.
- During execution, agents may steer the phase by editing scope/order and adding tasks or subtasks (for example, newly discovered implementation or validation work).
- Any mid-phase plan edits must keep priorities/status tags accurate and must not move the file to `completed/` until all active-scope tasks are done.
- Move finished phase files to `docs/exec-plans/completed/`.
- Update both this file and `docs/exec-plans/completed/index.md` when moving phases.

## Required Tracking Updates Per Task Completion
1. Mark task checkbox `[x]` in the phase file.
2. Add an entry to `docs/logs/changelog/<date>-<topic>.md`.
3. Add validation evidence to `docs/logs/validations/<date>-<topic>.md`.
4. If debt is introduced, add it to `docs/exec-plans/tech-debt-tracker.md`.

## Completed Phases
See `docs/exec-plans/completed/index.md`.
