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
- Phase 22 is completed and archived in `docs/exec-plans/completed/`.
- Phase 23 is completed and archived in `docs/exec-plans/completed/`.
- Phase 24 is completed and archived in `docs/exec-plans/completed/`.
- Phase 25 is completed and archived in `docs/exec-plans/completed/`.
- Phase 26 is completed and archived in `docs/exec-plans/completed/`.
- Phase 27 is completed and archived in `docs/exec-plans/completed/`.
- Phase 28 is completed and archived in `docs/exec-plans/completed/`.
- Phase 29 is completed and archived in `docs/exec-plans/completed/`.
- Phase 30 is completed and archived in `docs/exec-plans/completed/`.
- Phase 31 is completed and archived in `docs/exec-plans/completed/`.
- Phase 33 is completed and archived in `docs/exec-plans/completed/`.
- Phase 34 is completed and archived in `docs/exec-plans/completed/`.
- Phase 35 is completed and archived in `docs/exec-plans/completed/`.
- Phase 36 is completed and archived in `docs/exec-plans/completed/`.
- Phase 37 completed the documentation pivot to the B2B AI dataset marketplace model.
- No implementation phase is currently active.

## Product Direction
Caudals is now a B2B AI dataset marketplace and managed dataset build service. The public deployment is limited to the landing page, contact form, and blog. The marketplace remains hidden until buyer/supplier workflows, internal admin operations, data rights, and dataset build pipelines are redesigned for company-level data transactions.

## Queueing Rules
1. Work explicit user-requested items first.
2. Continue any `IN_PROGRESS` task.
3. Then execute highest-priority unblocked `P0`, then `P1`, then `P2`.
4. Prefer tasks that unlock multiple downstream tasks.

## Active Phase Queue
No active implementation phase is open.

When implementation resumes, create a new active phase from `docs/exec-plans/phase-template.md`. The next likely phase is the B2B marketplace replatforming plan:
- remove or replace legacy company-facing app routes,
- design the private admin dashboard around leads, supplier assets, dataset builds, QA, licensing, and catalog publication,
- define the new database model before exposing marketplace self-service.

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
