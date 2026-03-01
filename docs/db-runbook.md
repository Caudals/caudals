# Database Migration and Rollback Runbook

Last updated: 2026-03-01  
Owner: Platform engineering  
Applies to: self-hosted Supabase/Postgres environments (`staging`, `production`)

## 1) Principles

- Prefer additive migrations (new columns/tables/indexes) over destructive changes.
- Use forward-fix migrations as the default rollback strategy.
- Treat payment- and ledger-related migrations as high risk and schedule controlled windows.
- Never run schema changes without verified backups and an owner on-call.

## 2) Preconditions

Before applying any migration:

- [ ] Migration reviewed by at least one engineer.
- [ ] SQL reviewed for locking risk, full-table rewrites, and data loss paths.
- [ ] Staging migration completed and verified with no drift.
- [ ] Backup strategy verified for target environment.
- [ ] Release communication sent (window, owner, rollback owner).

## 3) Environment Variables and Access

Required:

- `SUPABASE_DB_URL`
- `SUPABASE_ACCESS_TOKEN` (if using management APIs)
- `NEXT_PUBLIC_SUPABASE_URL` (for post-migration app checks)

Access patterns:

- Supabase CLI against DB URL.
- Direct SSH access to self-hosted infrastructure when required.

## 4) Preflight Checks

Run from repository root:

```bash
npm run typecheck
npm test -- --run
npm run lint
```

Verify migration history:

```bash
supabase migration list --db-url "$SUPABASE_DB_URL"
```

Inspect pending migration SQL carefully:

```bash
ls -1 supabase/migrations
```

## 5) Staging Apply Procedure (Mandatory First)

1. Set `SUPABASE_DB_URL` to staging.
2. Apply migration(s) in order.
3. Refresh schema cache if using PostgREST.
4. Run validation suite:

```bash
npm run typecheck
npm test -- --run
PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test e2e/smoke.spec.ts --project=chromium
```

5. Verify impacted SQL entities exist and are queryable.

## 6) Production Apply Procedure

1. Confirm backup is recent and restorable.
2. Enter release window and announce start.
3. Point `SUPABASE_DB_URL` to production.
4. Apply migration.
5. Validate schema objects and critical queries.
6. Run targeted app health checks:
   - auth callback,
   - requester dataset list/create/edit,
   - funding + webhook processing,
   - admin moderation pages.
7. Announce completion with migration version.

## 7) Rollback Policy

### 7.1 Default: Forward Fix

If migration causes non-destructive issues:

1. Write a new migration that fixes schema/data drift.
2. Apply in same window if safe, or in immediate follow-up window.
3. Re-run targeted validations.

### 7.2 Controlled Revert (Destructive Cases Only)

Use only when:
- data loss risk is high,
- service is materially degraded,
- and forward-fix cannot recover safely in time.

Steps:

1. Put write-heavy operations in maintenance mode if needed.
2. Restore from backup to new instance or point-in-time target.
3. Validate core tables and payment integrity.
4. Re-route traffic only after application smoke checks pass.

## 8) Payment-Sensitive Migration Rules

For any migration touching:
- `transactions`
- `wallets`
- `dataset_requests.payment_status|paid_amount`
- Stripe webhook processing tables

Required safeguards:

- [ ] Ledger invariants checked before and after migration.
- [ ] No type/unit drift (`amount` vs `amount_cents`) introduced.
- [ ] Webhook idempotency table remains intact.
- [ ] Funding and payout critical path tested in staging first.

Post-migration validation examples:

```sql
-- Check transaction distribution by type/status
select type, status, count(*) from transactions group by 1,2 order by 1,2;

-- Check dataset payment state integrity
select payment_status, count(*) from dataset_requests group by 1 order by 1;

-- Check webhook replay records are still writable
select count(*) from stripe_webhook_events;
```

## 9) Incident Handling

If migration fails:

1. Stop further migration execution.
2. Capture SQL error + failing statement.
3. Decide: forward-fix vs restore path.
4. Communicate status every 15 minutes until resolved.
5. Write a postmortem note and add prevention follow-up tasks to `docs/project-tracker.md`.

## 10) Change Log Template

Use this template in release notes:

```text
Date:
Environment:
Migration version(s):
Owner:
Validation run:
Rollback owner:
Outcome:
Follow-up tasks:
```
