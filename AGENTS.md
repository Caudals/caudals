# Caudals Autonomous Agent Harness

## Mission
Agents in this repository must drive Caudals toward a polished, market-ready product with minimal supervision.

## Product Context
Caudals is an AI dataset operations platform with three role surfaces:
- Requester: creates/funds dataset requests, reviews submissions, exports approved data.
- Contributor: finds opportunities, submits data, tracks payouts.
- Admin: moderates requests/submissions, manages risk, operations, and payouts.

## Read Order Before Any Non-Trivial Work
1. `AGENTS.md`
2. `docs/index.md`
3. `docs/PLAN.md`
4. `ARCHITECTURE.md`
5. `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/SECURITY.md`
6. `docs/exec-plans/active/index.md` and selected active phase file
7. `docs/product-specs/index.md` and relevant spec
8. `docs/generated/db-schema.md`
9. `docs/TOOLS.md`
10. `docs/logs/index.md`

## Source-of-Truth File Contracts
- `docs/PLAN.md`: active queue, priorities, and planning lifecycle.
- `docs/exec-plans/active/*.md`: living execution plan per active phase.
- `docs/exec-plans/completed/*.md`: immutable completed phase records.
- `docs/exec-plans/tech-debt-tracker.md`: unresolved debt with priority and target phase.
- `docs/logs/changelog/*.md`: dated delivery record.
- `docs/logs/validations/*.md`: dated validation evidence.

## Autonomous Delivery Loop (Mandatory)
1. Select the highest-priority unblocked task from the active phase queue (unless user request overrides it).
2. Implement end-to-end (code, tests, docs, migration notes if needed).
3. Validate:
   - Run automated checks (`typecheck`, tests, lint, targeted E2E as needed).
   - For UI changes, use Chrome DevTools MCP (console/network/interaction checks + screenshots).
   - For DB-impacting changes, verify schema and policy behavior with Supabase tooling.
   - Use `docs/exec-plans/task-validation-checklist-template.md`.
   - Follow `docs/exec-plans/ui-verification-protocol.md` and `docs/exec-plans/blocker-escalation-protocol.md`.
4. Update checkboxes and status tags in the phase file.
5. Write dated entries in changelog and validation logs.
6. Continue with next queued task until blocked.

## Plan Lifecycle Rules
- Create one detailed phase file per large initiative in `docs/exec-plans/active/`.
- New phase files must be authored from `docs/exec-plans/phase-template.md`.
- Every phase file must include `## Stages` (`S1`, `S2`, ...) with mapped task IDs.
- Task IDs: `P<phase>-T<nn>` with optional subtasks `P<phase>-T<nn>-S<nn>`.
- Every task line must include:
  - checkbox (`[ ]` or `[x]`)
  - priority (`P0`, `P1`, `P2`)
  - status (`QUEUED`, `IN_PROGRESS`, `BLOCKED`, `DONE`)
  - owner (`agent` unless explicitly assigned)
- When a phase is complete, move it to `docs/exec-plans/completed/` and update `docs/PLAN.md` plus `docs/exec-plans/completed/index.md`.

## Product Prioritization Heuristics
1. Unblock core requester/contributor/admin marketplace loops first.
2. Prioritize work with direct KPI lift (activation, throughput, retention).
3. De-risk payments, moderation, and data integrity early.
4. Run polish passes after core behavior is reliable.

## Tooling and Skills
- Supabase MCP/CLI: schema checks, migrations, runtime data validation.
- Stripe MCP/CLI: payment and webhook diagnostics, controlled support operations.
- GitHub MCP and `gh`: issue/PR workflows and CI log triage.
- Chrome DevTools MCP: UI verification and screenshot capture.
- Terminal tooling: build/tests/lint/static analysis.
- UI work must follow `docs/DESIGN.md` and the local `frontend-design` skill.

## Non-Negotiables
- Preserve role isolation (`requester`, `contributor`, `admin`).
- Preserve payment/webhook consistency and idempotency.
- Never leak secrets in code, logs, docs, or screenshots.
- Avoid destructive operations unless explicitly required and documented.
- Keep plans and logs current.

## Stop Conditions
Pause only when:
- required credentials/access are missing,
- conflicting requirements cannot be resolved from repo context,
- next action is irreversible and high risk.

Before pausing, apply `docs/exec-plans/blocker-escalation-protocol.md` unless the stop condition is immediate high risk.

When paused, log blocker details in the active phase file and `docs/logs/changelog/`.
