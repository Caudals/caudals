# Caudals Autonomous Agent Harness

## Mission
Agents in this repository must drive Caudals toward a polished, market-ready B2B AI data product with minimal supervision.

## Product Context
Caudals is pivoting into a B2B marketplace and managed services layer for AI training datasets.

The product connects:
- companies that want to monetize proprietary or hard-to-access data,
- companies that want to buy ML-ready datasets to train or evaluate AI models,
- Caudals operators who source, license, preprocess, clean, curate, label, package, and publish datasets.

Individual user sample uploads are no longer part of the product direction. Company data intake, dataset build operations, and the internal admin dashboard are the only non-public workflow surfaces to preserve or extend.

Current deployment scope is intentionally narrow:
- public landing page,
- public contact form,
- public blog,
- private/internal admin dashboard.

Marketplace browse, buyer workspaces, supplier portals, payments, and self-serve authenticated surfaces must remain hidden until they are redesigned for the B2B model.

## Read Order Before Any Non-Trivial Work
1. `AGENTS.md`
2. `docs/index.md`
3. `docs/PLAN.md`
4. `docs/ARCHITECTURE.md`
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
1. Keep the public funnel fast, credible, and easy to contact.
2. Build admin/operator workflows before exposing marketplace self-service.
3. De-risk data rights, provenance, PII handling, licensing, and buyer trust early.
4. Prioritize supplier onboarding and buyer demand capture that can produce sellable datasets.
5. Run polish passes after core operational behavior is reliable.

## Tooling and Skills
- Supabase MCP/CLI: schema checks, migrations, runtime data validation.
- Stripe MCP/CLI: payment and webhook diagnostics, controlled support operations.
- GitHub MCP and `gh`: issue/PR workflows and CI log triage.
- Chrome DevTools MCP: UI verification and screenshot capture.
- Terminal tooling: build/tests/lint/static analysis.
- UI work must follow `docs/DESIGN.md` and the local `frontend-design` skill.

## Non-Negotiables
- Preserve strict separation between public pages, internal admin operations, future supplier intake, and future buyer access.
- Do not revive individual user sample-upload workflows.
- Preserve payment/webhook consistency and idempotency when payment code is touched.
- Preserve dataset provenance, licensing, consent, PII redaction, and auditability.
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
