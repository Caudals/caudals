# Security Contract

## Baseline
Security changes are first-class deliverables, not optional follow-ups.

## Non-Negotiables
- No secret leakage in code, docs, logs, screenshots, or test fixtures.
- Keep public API abuse controls active.
- Keep upload validation and path constraints enforced.
- Maintain webhook idempotency/replay protection.
- Keep service-role usage minimal and scoped.
- Require explicit `createAdminClient(scope)` usage; never rely on implicit/default scope fallback.
- Keep `payment_compliance_records` access restricted to admin + service-role policies only.

## Security Validation Checklist
1. Access control and ownership checks verified.
2. Input validation and safe error handling verified.
3. Logging redaction rules preserved.
4. Headers/CSP posture not weakened.
5. Payment compliance policy surface verified (`npm run payments:check-compliance-policies`).

## References
- `docs/references/legacy/security-baseline.md`
- `docs/references/legacy/service-role-surface.md`
- `docs/references/legacy/logging-redaction-policy.md`
- `docs/references/legacy/compliance-baseline.md`
