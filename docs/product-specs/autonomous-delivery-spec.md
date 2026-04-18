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
1. Keep landing, contact, and blog fast, accurate, localized, and aligned with the B2B data-marketplace message.
2. Remove or quarantine legacy individual-upload, old app, and retired marketplace assumptions before adding new product behavior.
3. Design the internal admin dashboard around leads, supplier assets, dataset builds, QA, rights, catalog listings, and commercial operations.
4. Define new schema contracts before relaunching marketplace, buyer, or supplier self-service.
5. Expand tests around public funnel integrity, landing-mode restrictions, contact/waitlist intake, and future admin operations.
6. De-risk rights, provenance, PII, licensing, and dataset quality before payments or catalog publication.
7. Close route/link dead-ends that break trust on public surfaces.

## Stop Conditions
Pause only for missing access, unresolvable requirement conflicts, or irreversible high-risk actions.
Use `docs/exec-plans/blocker-escalation-protocol.md` for bounded retries and escalation logging.
