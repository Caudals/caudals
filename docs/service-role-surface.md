# Service-Role Surface Audit

Last updated: 2026-03-01  
Task: `S7-T05`

## Objective

Minimize and document every location that uses Supabase service-role privileges.  
All service-role clients now include explicit scope headers via `createAdminClient(scope)`.

## Scoped Access Model

Defined in `lib/supabase/admin.ts`:

- `payments_ledger`
- `stripe_webhooks`
- `admin_operations`
- `notifications`
- `analytics_ingest`
- `file_uploads`
- `waitlist_intake`
- `retention_jobs`
- `debug_tools`
- `legacy_misc`

Each scoped client sets header `x-caudals-service-role-scope` for downstream traceability.

## Current Service-Role Call Sites

### Runtime APIs

- `app/(app)/api/webhooks/stripe/route.ts` -> `stripe_webhooks`
  - Required for webhook idempotency + ledger mutation regardless of user session.
- `app/(app)/api/upload/route.ts` -> `file_uploads`
  - Required for role/dataset ownership checks across uploader and dataset owner.
- `app/(app)/api/waitlist/route.ts` -> `waitlist_intake`
  - Required for public intake persistence without authenticated user.
- `app/(app)/api/debug/wallet/route.ts` -> `debug_tools`
  - Debug-only surface for controlled diagnostics.

### Server Actions

- `lib/actions/payment-actions.ts` -> `payments_ledger`
  - Required for canonical transaction and wallet writes.
- `lib/actions/wallet-actions.ts` -> `payments_ledger`
  - Required for wallet upsert/read consistency.
- `lib/actions/admin-actions.ts` -> `admin_operations`
  - Required for admin triage views and cross-role moderation operations.
- `lib/actions/notification-actions.ts` -> `notifications`
  - Required for notification state updates not fully user-scoped yet.

### Analytics Ingestion

- `lib/analytics/funnel-events-server.ts` -> `analytics_ingest`
  - Required for resilient event writes from public/authenticated contexts.

### Scheduled Jobs

- `scripts/cleanup-expired-artifacts.ts` -> `retention_jobs`
  - Required for retention cleanup and artifact purging.

## Minimization Changes Applied

1. Replaced unscoped `createAdminClient()` usage with explicit scope in app/runtime paths.
2. Kept service-role usage out of most requester/contributor user-scoped actions.
3. Added explicit audit document and scope taxonomy for ongoing reviews.

## Next Hardening Recommendations

1. Replace `legacy_misc` usages (if any appear) with explicit scopes.
2. Add CI check that fails on unscoped `createAdminClient("legacy_misc")` outside test/debug folders.
3. Move selected admin reads to RLS-backed user clients where practical.
