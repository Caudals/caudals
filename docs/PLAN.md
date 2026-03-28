# Caudals Master Plan

## Purpose
Global execution board for long-running autonomous delivery.

## Exec-Plans Directory Contract
- `docs/exec-plans/active/`: in-progress phase plans (living documents)
- `docs/exec-plans/completed/`: finished phase plans (immutable)
- `docs/exec-plans/phase-template.md`: required template for new phases
- `docs/exec-plans/task-validation-checklist-template.md`: per-task validation checklist
- `docs/exec-plans/ui-verification-protocol.md`: frontend QA protocol
- `docs/exec-plans/blocker-escalation-protocol.md`: blocker retry/escalation protocol
- `docs/exec-plans/tech-debt-tracker.md`: unresolved debt queue
- `docs/exec-plans/weekly-planning-reset.md`: recurring queue hygiene checklist

## Program State
- Phases 00-19 are completed and archived in `docs/exec-plans/completed/`.
- Phase 21 is completed and archived in `docs/exec-plans/completed/`.
- Phase 22 is completed and archived in `docs/exec-plans/completed/`.
- Phase 23 is completed and archived in `docs/exec-plans/completed/`.
- Phase 24 is completed and archived in `docs/exec-plans/completed/`.
- Phase 25 is completed and archived in `docs/exec-plans/completed/`.
- Phase 26 is completed and archived in `docs/exec-plans/completed/`.
- Phase 27 is completed and archived in `docs/exec-plans/completed/`.
- Phase 28 is completed and archived in `docs/exec-plans/completed/`.
- Phase 29 is completed and archived in `docs/exec-plans/completed/`.
- Phase 30 is completed and archived in `docs/exec-plans/completed/`.
- Active delivery focus returns to Phase 17.
- Phase 20 remains queued for dashboard workflow gaps.

## Queueing Rules
1. Work explicit user-requested items first.
2. Continue any `IN_PROGRESS` task.
3. Then execute highest-priority unblocked `P0`, then `P1`, then `P2`.
4. Prefer tasks that unlock multiple downstream tasks.

## Active Phase Queue
1. **Phase 17 – Castilian Spanish Localization Overhaul** (`docs/exec-plans/active/phase-17-castilian-spanish-localization-overhaul.md`) — IN_PROGRESS, P0
2. **Phase 20 – Dashboard Feature Gaps and Missing Workflows** (`docs/exec-plans/active/phase-20-dashboard-missing-features.md`) — QUEUED, P1

## Phase Lifecycle (Canonical)
- Create one detailed phase file per initiative in `docs/exec-plans/active/` using `docs/exec-plans/phase-template.md`.
- Every phase file must include:
  - `## Stages` with ordered stages (`S1`, `S2`, ...), each mapped to task IDs
  - task IDs (`Pxx-Tnn` and optional `Pxx-Tnn-Snn`)
  - checkbox + priority + status + owner metadata per task
- Active phase files are living documents while in progress.
- When all active-scope tasks are done, move phase file to `docs/exec-plans/completed/`.
- On phase completion, update:
  - `docs/PLAN.md`
  - `docs/exec-plans/active/index.md`
  - `docs/exec-plans/completed/index.md`

## Required Tracking Updates Per Task Completion
1. Mark task `[x]` with `DONE` status in phase file.
2. Add dated entry in `docs/logs/changelog/`.
3. Add dated validation evidence in `docs/logs/validations/`.
4. Add unresolved debt to `docs/exec-plans/tech-debt-tracker.md`.

## Validation Standards
- Use `docs/exec-plans/task-validation-checklist-template.md`.
- For frontend changes, follow `docs/exec-plans/ui-verification-protocol.md`.
- For blocked work, follow `docs/exec-plans/blocker-escalation-protocol.md`.

## Planning Hygiene
Run `docs/exec-plans/weekly-planning-reset.md` weekly (or immediately after closing a major phase).

## Completed Phases
See `docs/exec-plans/completed/index.md`.
