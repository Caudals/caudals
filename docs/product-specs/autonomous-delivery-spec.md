# Autonomous Delivery Spec

## Goal
Enable agents to continuously plan, build, validate, and document product improvements with minimal supervision.

## Execution Contract
1. Select work from `docs/PLAN.md` and active phase files.
2. Implement coherent increments end-to-end.
3. Validate behavior and runtime impact.
4. Log changelog + validation evidence.
5. Continue with next queued unblocked task.

## Validation Requirements
- Backend: type checks and targeted tests for affected modules.
- Frontend: Chrome DevTools MCP checks + responsive screenshots.
- Data: schema/policy checks for DB-impacting work.
- Payments: webhook and ledger integrity checks for payment-impacting work.

## Definition of Done (Per Task)
- scope implemented,
- tests/checks executed,
- runtime behavior validated,
- evidence logged,
- debt captured if unresolved tradeoffs remain.

## Autonomous Roadmap Heuristics (When User Queue Is Empty)
1. Implement missing DB-backed requester/admin action flows before UI polish.
2. Prioritize payout/funding/webhook resilience and ledger consistency checks.
3. Eliminate placeholder-heavy operational workflows (support, analytics, moderation sidecars).
4. Expand integration tests for critical lifecycle transitions (approval, funding, payout, export).
5. Harden export orchestration and recovery behavior using durable queue semantics.
6. Unify wallet/ledger contract assumptions and remove stale legacy behavior paths.
7. Close route/link dead-ends that break trust on public and app surfaces.

## Stop Conditions
Pause only for missing access, unresolvable requirement conflicts, or irreversible high-risk actions.
Use `docs/exec-plans/blocker-escalation-protocol.md` for bounded retries and escalation logging.
