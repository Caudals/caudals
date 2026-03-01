# Agent Execution Rules

Last updated: 2026-03-01  
Tracker of record: `docs/project-tracker.md`

## Purpose

Provide a single operational protocol so all AI agents execute autonomously with consistent quality, documentation, and validation.

## Non-Negotiable Workflow

1. Start with explicit user-requested tasks.
2. Continue automatically with the next most logical unchecked tasks.
3. Follow dependency order and stage continuity whenever possible.
4. Implement end-to-end, then validate (`typecheck`, tests, lint, and task-specific checks).
5. Update tracker checkboxes and `Completion Notes` immediately after validation.
6. Add follow-up tasks if gaps are discovered.
7. Repeat until no eligible tasks remain or a hard blocker is reached.

## Task State Rules

- Use `[x]` only when implementation and validation are complete.
- Use `[ ]` for not started or blocked tasks.
- Add inline tag when needed:
  - `IN PROGRESS - <agent/date>`
  - `BLOCKED - <reason>`
- Remove `IN PROGRESS` when task is done.

## Autonomous Continuation Rules

- Do not stop after one completed task if related unchecked tasks remain.
- Prefer this queue:
  1. User-requested task(s)
  2. Existing `IN PROGRESS` tasks
  3. P0 tasks that unblock other work
  4. P1 tasks in the active stage
  5. P2 tasks and backlog refinements
- If a stage is complete but quality is not market-ready, create hardening tasks (tests, UX polish, reliability, security, observability).

## Validation Minimum

At minimum, run:

- `npm run typecheck`
- `npm test -- --run`
- `npm run lint` (warnings are allowed if pre-existing and documented)

Add flow-specific checks where relevant:

- Playwright smoke suites for route/UX changes.
- Lifecycle/payment/webhook tests for financial and workflow changes.
- Security checks for API or storage changes.

## Documentation Requirements

For each completed task, add one `Completion Notes` entry with:

- date,
- task ID(s),
- what changed,
- validation commands and outcomes.

When scope expands:

- add deterministic follow-up tasks in tracker (`Sx-Tnn-F1`, `Sx-Tnn-F2`),
- include acceptance criteria and file ownership.

## Stop Conditions

Pause and ask user only when:

- required credentials/access are missing,
- destructive/irreversible operation needs explicit confirmation,
- requirements conflict and cannot be resolved from repository context.

