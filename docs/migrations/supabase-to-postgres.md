# Supabase to PostgreSQL Migration

## Status

In progress. Supabase remains live and must not be decommissioned until the migration report records the dump, transform, load, sampled diff verification, final encrypted backup, and explicit decommission approval.

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

## Not Done Yet

- Supabase data dump, transform, load, row-count verification, and sampled diff.
- Run the Better Auth account migration against the live Supabase database and issue reset-password emails.
- Final Supabase backup and explicit decommission approval.
