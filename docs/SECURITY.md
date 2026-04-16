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
- Keep host-level admin/data-plane ports off the public internet.
- Keep production SSH publickey-only and Tailscale-only.
- Keep operational dashboards and control panels private; password-protected public login pages are not sufficient protection.
- Do not bake server-side secrets into Docker image layers or final image `ENV`.

## Host Hardening Baseline
- UFW must run with default-deny inbound posture.
- Small VPS nodes must keep swap enabled and journald bounded so admin access remains available under memory pressure.
- Docker/Swarm admin and raw service ports (`3000`, `3001`, `4000`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946`, `4789`) must be blocked from the public internet.
- Supabase Studio must not be publicly routed on `supabase.caudals.com`.
- Dokploy and analytics dashboards must be reachable only through Tailscale/private access paths.
- Direct dashboard ports exposed for tailnet access must be allowed only on `tailscale0` and remain closed publicly.
- Raw Supabase admin/data-plane ports must be accessed only over SSH tunnel or Tailscale/private paths.
- SSH password auth must remain disabled and root password login must stay locked.

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
- `docs/private-dashboard-access.md`
