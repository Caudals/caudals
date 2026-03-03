# Exec Plans

## Purpose
Implements an execution-plan workflow for long-running autonomous work.

## Folder Contract
- `active/`: only phases currently being executed.
- `completed/`: immutable finished phases.
- `tech-debt-tracker.md`: cross-phase debt and refactor queue.
- `task-validation-checklist-template.md`: per-task validation checklist.
- `ui-verification-protocol.md`: frontend QA and screenshot protocol.
- `blocker-escalation-protocol.md`: retry/escalation sequence for blocked work.
- `weekly-planning-reset.md`: recurring queue hygiene cadence.

## Phase File Requirements
Every phase file must include:
- goal and exit criteria,
- prioritized task list with checkboxes,
- task status tags (`QUEUED`, `IN_PROGRESS`, `BLOCKED`, `DONE`),
- validation requirements,
- completion evidence links.

## Active Phase Steering Rules
- Files under `active/` are dynamic documents while execution is in progress.
- Agents may update task ordering, split work into new subtasks, or add missing tasks when execution reveals additional scope.
- If scope changes, update priorities/status tags in the same edit so queue intent stays accurate.
- Keep `active/` files mutable and move them to `completed/` only when the final scope is fully done.

## Completion Protocol
1. Ensure all phase tasks are `[x]`.
2. Add final evidence to logs.
3. Move phase file from `active/` to `completed/`.
4. Update `docs/PLAN.md`, `active/index.md`, and `completed/index.md`.
