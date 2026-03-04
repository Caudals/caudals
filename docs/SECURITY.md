# Security Contract

## Baseline
Security and compliance are first-class deliverables in every phase.

## Non-Negotiables
- No secret leakage in code, docs, logs, screenshots, or test fixtures.
- Preserve role isolation and ownership boundaries.
- Keep public API abuse controls active (durable over in-memory-only strategies).
- Keep upload validation and path constraints enforced.
- Maintain webhook idempotency/replay protection.
- Keep service-role usage minimal and explicitly scoped.
- Require explicit `createAdminClient(scope)` usage.
- Keep `payment_compliance_records` access restricted to admin + service-role policy paths.

## Security Validation Checklist
1. Access control and ownership checks verified.
2. Input validation and safe error handling verified.
3. Logging redaction posture preserved.
4. Headers/CSP posture not weakened.
5. Payment compliance policy checks pass (`npm run payments:check-compliance-policies`).

## Related References
- `ARCHITECTURE.md`
- `docs/generated/db-schema.md`
- `docs/TOOLS.md`
