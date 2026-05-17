# Supabase to PostgreSQL Migration

## Status

Complete for Phase 1. The private `caudals-postgres` target is live on the VPS, the app service is cut over to it, public-funnel rows have been migrated, and legacy Supabase containers/images/volumes plus the host `/supabase` tree have been removed. Verified encrypted database and filesystem backups are staged under `/root/.caudals/backups`; off-host Spaces upload was not possible because Spaces credentials are not present on the VPS.

## Current Slice

- Added `db/migrations/001_operator_core.sql` as the Phase 1 self-hosted PostgreSQL schema baseline for the Operator Console.
- Added `db/rollbacks/001_operator_core_down.sql` for reversible local/integration testing.
- Added `db/migrations/002_audit_event_default_partition.sql` and rollback so audit writes do not fail outside pre-created quarter partitions.
- The schema uses ULID-prefixed text IDs, plain PostgreSQL RLS via session settings, core §28 records, state constraints from §23, audit partitioning, and Marquez-shaped lineage rows.
- Added `db/migrations/024_build_cost_envelopes.sql` for section 27 build cost
  envelopes: append-only cost entries roll into builds, soft budget thresholds
  alert, hard budget/sub-budget overruns require override reasons, and >15%
  overruns flag margin retrospectives.
- Added `db/migrations/025_escalation_runbooks.sql` for section 24 escalation
  operations: canonical R-01..R-10 runbooks, top-level escalation cases,
  automatic runbook/on-call routing, alerts, and audit evidence.
- Added `db/migrations/027_security_incident_runbooks.sql` for section 25
  incident response: security-specific R-11..R-13 runbooks and new
  `security_event` auto-routing to R-11.
- Added `db/migrations/026_security_review_library.sql` for the M3 security
  review library: published questionnaire answers, DPA review-path notes, and
  security packet items backing `/security`.
- Verified the migrations and rollbacks against a temporary `supabase/postgres:15.8.1.085` container with pgvector available.
- Removed the remaining Supabase Storage helper path. Browser uploads now delegate to `/api/upload`, active writes/deletes use DigitalOcean Spaces, and `lib/storage/get-public-url.ts` is CDN-first while still recognizing legacy absolute object URLs already stored in records.
- Added the Better Auth server/client scaffold and `/api/auth/[...all]` endpoint, configured for the existing PostgreSQL pool, organization membership, TOTP, passkeys, and disabled self-serve sign-up.
- Added `db/migrations/003_better_auth_identity.sql` and rollback for the prefixed Better Auth identity tables.
- Added `db/migrations/004_abuse_rate_limit.sql` and rollback for durable contact/waitlist rate limiting on self-hosted PostgreSQL.
- Added `db/migrations/005_waitlist_signup.sql` and rollback for public waitlist persistence on self-hosted PostgreSQL.
- Added `db/migrations/006_product_analytics_event.sql` and rollback for first-party analytics event ingestion on self-hosted PostgreSQL.
- Added `db/migrations/007_stripe_webhook_event.sql` and rollback for replay-safe Stripe webhook intake on self-hosted PostgreSQL.
- Added `db/migrations/008_operator_elevation.sql` and rollback for time-bounded operator JIT production-DB elevation grants with audit rows.
- Added the Operator Console Settings workflow for audited JIT production-DB elevation grants/revokes, active-grant status, and runtime enforcement visibility.
- Added the Operator Console Settings workflow for Ed25519 delivery signing-key generation with encrypted private-key storage in PostgreSQL.
- Added and applied `db/migrations/010_operator_record_note.sql` for cross-module audited operator notes with org-scoped RLS.
- Added and applied `db/migrations/011_optional_operator_security_factors.sql` so migrated operators can log in with password-only Better Auth sessions while TOTP/passkeys remain optional hardening.
- Added expanded audited Operator Console record CRUD for module create targets and mutable anchor work-queue rows, with append-only audit/cost exceptions and type-diverse queue selection so low-priority anchor records stay visible.
- Added Sentry/Next.js instrumentation and opt-in OpenTelemetry stdout traces for the Postgres-backed app runtime.
- Added `npm run migrate:supabase-auth` for apply-gated legacy Supabase admin-account migration into Better Auth/operator tables.
- Live Supabase Auth dry-run found 4 operator accounts to migrate and 25 non-operator legacy accounts to skip.
- Added `infra/postgres/Dockerfile` and `db/migrations/009_postgres_runtime_extensions.sql` for the Postgres 16 + pgvector + pg_cron runtime.
- Created the private `caudals-postgres` swarm service on `dokploy-network` with a persistent volume and Docker secret-backed password.
- Applied migrations `001` through `009` to `caudals-postgres`; verified `citext`, `pg_cron`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, and `vector`.
- Seeded the Phase 1 fixture set into `caudals-postgres`: 5 builds and 35 gate events.
- Backfilled deterministic `build_gate_summary` audit events so each seeded build has build-target audit evidence for its G-1..G-7 gate set.
- Applied the Supabase Auth migration to `caudals-postgres`: 4 operator accounts, 4 migration audit events, and 25 skipped non-operator accounts.
- Added Docker secret-file fallback support for app database and Better Auth secrets ahead of service cutover.
- Cut over `caudalsdep-caudals-vgbvxp` to image `mariomedpar/caudals:phase1-ed46abd` with `DATABASE_URL_FILE`, `BETTER_AUTH_SECRET_FILE`, and `OPERATOR_CONSOLE_DATA_SOURCE=postgres`.
- Current deployed Phase 1 app image is `mariomedpar/caudals:phase1-202605110325`.
- Deployed smoke passed against `https://app.caudals.com`: public landing/auth route smoke and authenticated fixture-operator console smoke.
- Removed obsolete active Supabase public build/runtime configuration from the Dockerfile, GitHub Actions workflows, Next image remote patterns, env example, and migration-script source variable fallbacks; only `LEGACY_SUPABASE_DATABASE_URL` remains for explicit one-off legacy migration reruns.
- Added `npm run migrate:public-funnel`, an apply-gated migration for legacy waitlist, product analytics, Stripe webhook replay, and rate-limit rows.
- Applied the public-funnel migration to `caudals-postgres`: 9 waitlist signups, 1,328 analytics events, 19 Stripe webhook events, and 249 abuse rate-limit rows.
- Verified migrated subsets by deterministic target keys and selected status/timestamp fields: waitlist 9/9, analytics 1,328/1,328, Stripe 19/19, abuse 249/249.
- Re-ran the Supabase Auth migration with `--send-resets`; 4 migrated operator accounts received Better Auth password-reset requests.
- Added and deployed the Operator Console Settings security-enrollment roster so admins can track migrated operators' Better Auth MFA/passkey readiness from production.
- Created a local encrypted Supabase database backup under `/root/.caudals/backups` with a root-only key file; decryption and `pg_restore -l` listing verified 943 archive entries.
- Created a final encrypted Supabase database backup after cutover; checksum verification passed and `pg_restore -l` listed 943 archive entries.
- Created a final encrypted `/supabase` filesystem archive before host cleanup; checksum verification passed and `tar -tf` listed 5,109 archive entries.
- Removed the legacy Supabase compose containers, `supabase_default` network, named volumes, service images, and `/supabase` host filesystem tree.
- Removed stale Supabase runtime env keys from the deployed app service.
- Removed the legacy repo `supabase/` migration tree and the Supabase CLI dev dependency.

## Not Done Yet

- Optional: upload encrypted backups to Spaces when Spaces credentials are available.
- Migrated real operators must complete the Better Auth password-reset flow before first login. TOTP and passkeys are optional hardening; password-only `/admin` access is allowed by policy.
