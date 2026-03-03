# 2026-03-03 - Phase 14 Export Queue Reliability and Fixture Stability (`P14-T01`, `P14-T02`)

## Scope

- Started Phase 14 and executed `P14-T01` to close export-lifecycle reliability debt (`TD-002`).
- Reworked dataset export processing from synchronous requester action execution to durable queued worker processing.

## Completed Work

- Added export worker module:
  - `lib/jobs/export-jobs.ts`
  - queue claim semantics (`pending -> preparing -> ready/failed`)
  - artifact upload + metadata updates + failure handling
- Added protected internal processing endpoint:
  - `app/(app)/api/internal/export-jobs/route.ts`
  - token-protected via `EXPORT_JOBS_TOKEN`
- Added scheduled/manual worker runner script:
  - `scripts/process-export-jobs.ts`
  - npm command: `npm run jobs:process-exports`
- Refactored requester export action to enqueue and return quickly:
  - `lib/actions/requester-actions.ts`
  - export generation/upload removed from request path
  - durable queue kick is now best-effort and non-blocking
- Added service-role scope for export jobs:
  - `lib/supabase/admin.ts`
- Updated operational docs and env template:
  - `.env.example`
  - `docs/README.md`
- Updated planning artifacts and debt status:
  - `docs/exec-plans/active/phase-14-export-queue-reliability-and-debt-closure.md`
  - `docs/exec-plans/tech-debt-tracker.md` (`TD-002` marked `RESOLVED`)

## Additional Completed Work (`P14-T02`)

- Refactored fixture seeding script into reusable exported flow:
  - `scripts/seed-test-fixtures.ts`
- Added fixture freshness guard script with stale-detection + auto-reseed:
  - `scripts/ensure-test-fixtures.ts`
- Wired fixture freshness check into authenticated smoke workflow:
  - `package.json` (`e2e:auth-smoke` now runs `fixtures:ensure` first)
- Added fixture freshness env controls:
  - `.env.example` (`TEST_FIXTURE_MAX_AGE_HOURS`, `TEST_FIXTURE_AUTO_RESEED`)
- Updated docs for fixture freshness command:
  - `docs/README.md`
- Updated debt tracker status:
  - `docs/exec-plans/tech-debt-tracker.md` (`TD-004` marked `RESOLVED`)

## Additional Completed Work (`P14-T04`)

- Closed `TD-003` by accepting the delivered/validated anomaly-correlation implementation from Phase 15:
  - `lib/actions/admin-actions.ts` (`getAdminPaymentAnomalies`)
  - `app/(app)/admin/payments/page.tsx` (unified anomaly drilldowns and filters)
- Updated planning/debt artifacts to reflect closure:
  - `docs/exec-plans/active/phase-14-export-queue-reliability-and-debt-closure.md`
  - `docs/exec-plans/tech-debt-tracker.md` (`TD-003` -> `RESOLVED`)

## Additional Completed Work (`P14-T03`, `P14-T05`)

- Replaced in-memory abuse limiter with durable DB-backed limiter (`TD-001`):
  - migration:
    - `supabase/migrations/026_durable_abuse_rate_limits.sql`
    - adds `public.abuse_rate_limits`
    - adds RPC `consume_abuse_rate_limit(...)`
    - adds cleanup RPC `cleanup_abuse_rate_limits(...)`
  - service-role scope contract update:
    - `lib/supabase/admin.ts` (`abuse_controls`)
  - runtime limiter implementation:
    - `lib/security/rate-limit.ts`
    - hashed limiter keys persisted in DB
    - safe in-memory fallback on RPC unavailability
  - public API route integrations:
    - `app/(app)/api/waitlist/route.ts`
    - `app/(app)/api/collaborations/route.ts`
    - `app/(app)/api/analytics/track/route.ts`
  - tests:
    - `lib/security/rate-limit.test.ts`

- Added EN/ES missing-key localization guardrail (`TD-005`):
  - script: `scripts/check-i18n-parity.ts`
  - npm command: `npm run i18n:check-parity`
  - added missing key in runtime ES dictionary:
    - `lib/i18n/es.json` (`Reach us at`)
  - docs:
    - `docs/references/localization-qa-runbook.md`
    - `docs/references/tooling-and-mcp.md`
    - `docs/README.md`

- Updated security/schema/debt artifacts:
  - `docs/SECURITY.md`
  - `docs/generated/db-schema.md`
  - `docs/exec-plans/tech-debt-tracker.md` (`TD-001`, `TD-005` -> `RESOLVED`)
