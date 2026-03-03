# Caudals Master Plan

## Purpose

This is the global execution board for long-running autonomous delivery.

## Program State

- Historical delivery Phases 00-10 are completed and archived in `docs/exec-plans/completed/`.
- Phase 11 (Autonomous Agent Runtime) was completed on 2026-03-03 and archived in `docs/exec-plans/completed/`.
- Phase 12 (App Review and Dashboard Refactor) was completed on 2026-03-03 and archived in `docs/exec-plans/completed/`.
- Phase 14 (Export Queue Reliability and Debt Closure) was completed on 2026-03-03 and archived in `docs/exec-plans/completed/`.
- Phase 15 (Payments and Payouts Market Readiness) was completed on 2026-03-03 and archived in `docs/exec-plans/completed/`.
- Phase 16 (Market Readiness Polish and Growth) was completed on 2026-03-03 and archived in `docs/exec-plans/completed/`.

## Queueing Rules

1. Work user-requested items first.
2. Continue with `IN_PROGRESS` tasks.
3. Then execute highest-priority unblocked `P0`, followed by `P1`, then `P2`.
4. Prefer tasks that unlock multiple downstream tasks.

## Active Phase Queue

1. **Phase 17 – Castilian Spanish Localization Overhaul** (`docs/exec-plans/active/phase-17-castilian-spanish-localization-overhaul.md`) — IN_PROGRESS, P0

## Planning Lifecycle

- Create one new file per new large phase in `docs/exec-plans/active/`.
- Author each new phase from `docs/exec-plans/phase-template.md` with enough detail for resume/recovery (context, scope, validation, and evidence expectations).
- Require a `## Stages` section in every new phase file, with ordered stage breakdown and task/subtask mapping under each stage.
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

## Validation Standards

- Use `docs/exec-plans/task-validation-checklist-template.md` for per-task validation completion.
- For frontend changes, follow `docs/exec-plans/ui-verification-protocol.md` (console/network checks, required viewports, screenshot naming).
- For blocker handling and long-running retries, follow `docs/exec-plans/blocker-escalation-protocol.md`.

## Planning Cadence

- Run `docs/exec-plans/weekly-planning-reset.md` once per week (or immediately after closing a major phase) to keep queue/order/status artifacts fresh.

## Completed Phases

See `docs/exec-plans/completed/index.md`.
