# Supabase to PostgreSQL Migration

## Status

In progress. The private `caudals-postgres` target is live on the VPS, the app service is cut over to it, and public-funnel rows have been migrated. Supabase remains live until final encrypted backup and explicit decommission approval.

## Current Slice

- Added `db/migrations/001_operator_core.sql` as the Phase 1 self-hosted PostgreSQL schema baseline for the Operator Console.
- Added `db/rollbacks/001_operator_core_down.sql` for reversible local/integration testing.
- Added `db/migrations/002_audit_event_default_partition.sql` and rollback so audit writes do not fail outside pre-created quarter partitions.
- The schema uses ULID-prefixed text IDs, plain PostgreSQL RLS via session settings, core §28 records, state constraints from §23, audit partitioning, and Marquez-shaped lineage rows.
- Verified the migrations and rollbacks against a temporary `supabase/postgres:15.8.1.085` container with pgvector available.
- Removed the remaining Supabase Storage helper path. Browser uploads now delegate to `/api/upload`, active writes/deletes use DigitalOcean Spaces, and `lib/storage/get-public-url.ts` is CDN-first while still recognizing legacy absolute object URLs already stored in records.
- Added the Better Auth server/client scaffold and `/api/auth/[...all]` endpoint, configured for the existing PostgreSQL pool, organization membership, TOTP, passkeys, and disabled self-serve sign-up.
- Added `db/migrations/003_better_auth_identity.sql` and rollback for the prefixed Better Auth identity tables.
- Added `db/migrations/004_abuse_rate_limit.sql` and rollback for durable contact/waitlist rate limiting on self-hosted PostgreSQL.
- Added `db/migrations/005_waitlist_signup.sql` and rollback for public waitlist persistence on self-hosted PostgreSQL.
- Added `db/migrations/006_product_analytics_event.sql` and rollback for first-party analytics event ingestion on self-hosted PostgreSQL.
- Added `db/migrations/007_stripe_webhook_event.sql` and rollback for replay-safe Stripe webhook intake on self-hosted PostgreSQL.
- Added `db/migrations/008_operator_elevation.sql` and rollback for time-bounded operator JIT production-DB elevation grants with audit rows.
- Added `npm run migrate:supabase-auth` for apply-gated legacy Supabase admin-account migration into Better Auth/operator tables.
- Live Supabase Auth dry-run found 4 operator accounts to migrate and 25 non-operator legacy accounts to skip.
- Added `infra/postgres/Dockerfile` and `db/migrations/009_postgres_runtime_extensions.sql` for the Postgres 16 + pgvector + pg_cron runtime.
- Created the private `caudals-postgres` swarm service on `dokploy-network` with a persistent volume and Docker secret-backed password.
- Applied migrations `001` through `009` to `caudals-postgres`; verified `citext`, `pg_cron`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, and `vector`.
- Seeded the Phase 1 fixture set into `caudals-postgres`: 5 builds and 35 gate events.
- Applied the Supabase Auth migration to `caudals-postgres`: 4 operator accounts, 4 migration audit events, and 25 skipped non-operator accounts.
- Added Docker secret-file fallback support for app database and Better Auth secrets ahead of service cutover.
- Cut over `caudalsdep-caudals-vgbvxp` to image `mariomedpar/caudals:phase1-ed46abd` with `DATABASE_URL_FILE`, `BETTER_AUTH_SECRET_FILE`, and `OPERATOR_CONSOLE_DATA_SOURCE=postgres`.
- Deployed smoke passed against `https://app.caudals.com`: public landing/auth route smoke and authenticated fixture-operator console smoke.
- Added `npm run migrate:public-funnel`, an apply-gated migration for legacy waitlist, product analytics, Stripe webhook replay, and rate-limit rows.
- Applied the public-funnel migration to `caudals-postgres`: 9 waitlist signups, 1,328 analytics events, 19 Stripe webhook events, and 249 abuse rate-limit rows.
- Verified migrated subsets by deterministic target keys and selected status/timestamp fields: waitlist 9/9, analytics 1,328/1,328, Stripe 19/19, abuse 249/249.

## Not Done Yet

- Issue reset-password emails for migrated operators.
- Final Supabase backup and explicit decommission approval.
