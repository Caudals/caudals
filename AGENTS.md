# Caudals Autonomous Agent Harness

## Mission
Agents operating in this repository must drive Caudals toward a polished, market-ready product with minimal supervision.

## Product Context
Caudals is an AI dataset operations platform with three role surfaces:
- Requester: creates/funds dataset requests, reviews submissions, exports approved data.
- Contributor: finds opportunities, submits data, tracks payouts.
- Admin: moderates requests/submissions, manages risk, operations, and payouts.

## Read Order Before Any Non-Trivial Work
1. `AGENTS.md`
2. `docs/PLAN.md`
3. `ARCHITECTURE.md`
4. `docs/DESIGN.md` and `docs/FRONTEND.md`
5. `docs/SECURITY.md`, `docs/RELIABILITY.md`, `docs/QUALITY_SCORE.md`
6. `docs/exec-plans/active/index.md` and the selected active phase file
7. `docs/product-specs/index.md` and relevant spec
8. `docs/generated/db-schema.md`
9. `docs/file-usage.md`
10. `docs/logs/index.md`

## Source-of-Truth File Contracts
- `docs/PLAN.md`: global queue, current phase priorities, and execution rules.
- `docs/exec-plans/active/*.md`: one file per active phase.
- `docs/exec-plans/completed/*.md`: immutable completed phases.
- `docs/exec-plans/tech-debt-tracker.md`: unresolved debt, owner, impact, and target phase.
- `docs/logs/changelog/*.md`: dated accomplishments and what changed.
- `docs/logs/validations/*.md`: dated verification evidence (tests, screenshots, runtime checks).

## Autonomous Delivery Loop (Mandatory)
1. Select the highest-priority unblocked task from the active phase queue.
2. Implement end-to-end (code, tests, docs, migration notes if needed).
3. Validate:
   - Run automated checks (`typecheck`, tests, lint, targeted E2E).
   - For UI changes, use Chrome DevTools MCP: inspect console/network, verify responsive breakpoints, capture screenshots.
   - For DB-impacting changes, verify schema and policy behavior in Supabase.
   - Use `docs/exec-plans/task-validation-checklist-template.md` for per-task evidence.
   - Follow `docs/exec-plans/ui-verification-protocol.md` for frontend QA and screenshot naming.
   - Follow `docs/exec-plans/blocker-escalation-protocol.md` for retry and escalation handling on blocked/long-running tasks.
4. Update checkboxes and status tags in the phase file.
5. Write a dated entry in changelog and validation logs.
6. Continue with next queued task until blocked.

## Plan Lifecycle Rules
- Every large initiative gets its own phase file in `docs/exec-plans/active/`.
- Use task IDs: `P<phase>-T<nn>` and optional subtasks `P<phase>-T<nn>-S<nn>`.
- Track each task with:
  - checkbox (`[ ]` or `[x]`)
  - priority (`P0`, `P1`, `P2`)
  - status tag (`QUEUED`, `IN_PROGRESS`, `BLOCKED`, `DONE`)
  - owner (`agent` unless assigned otherwise)
- When all tasks in a phase are done, move file to `docs/exec-plans/completed/` and update `docs/PLAN.md` + `completed/index.md`.

## Tooling and MCP Usage
- Supabase MCP / CLI: schema checks, data validation, safe migrations.
- GitHub MCP: issue/PR tracking and review workflows.
- Chrome DevTools MCP: visual QA, interaction checks, screenshots.
- Terminal tooling: build, tests, lint, static analysis.

## Non-Negotiables
- Preserve role isolation (`requester`, `contributor`, `admin`).
- Preserve payment/webhook consistency and idempotency.
- Never leak secrets in code, logs, docs, or screenshots.
- Avoid destructive operations unless explicitly required and documented.
- Keep plans and logs current; stale planning artifacts are considered failures.

## Stop Conditions
Pause only when:
- required credentials/access are missing,
- conflicting requirements cannot be resolved from repo context,
- the next action is irreversible and high risk.

Before pausing, apply the bounded retry/escalation sequence in `docs/exec-plans/blocker-escalation-protocol.md` unless the stop condition is immediate high risk.

When paused, log blocker details in the active phase file and `docs/logs/changelog/`.
