# Supabase to PostgreSQL Migration

## Status

In progress. Supabase remains live and must not be decommissioned until the new self-hosted PostgreSQL stack has run against migrated internal data for at least 48 hours and a final encrypted backup has been taken.

## Current Slice

- Added `db/migrations/001_operator_core.sql` as the Phase 1 self-hosted PostgreSQL schema baseline for the Operator Console.
- Added `db/rollbacks/001_operator_core_down.sql` for reversible local/integration testing.
- The schema uses ULID-prefixed text IDs, plain PostgreSQL RLS via session settings, core §28 records, state constraints from §23, audit partitioning, and Marquez-shaped lineage rows.
- Verified the migration and rollback against a temporary `supabase/postgres:15.8.1.085` container with pgvector available.

## Not Done Yet

- Supabase data dump, transform, load, row-count verification, and sampled diff.
- Better Auth account migration.
- Application DB client migration from Supabase to PostgreSQL.
- DO Spaces cutover verification for every storage call site.
- 48-hour internal-use gate and final Supabase backup/decommission.
