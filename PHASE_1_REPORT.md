# Phase 1 Report

## Current Slice Plan

- Establish the operator-domain core for Phase 1: state machines, transition validation, audit-event payloads, and license composition.
- Keep the slice independent of the Supabase to Postgres migration so it can be unit-tested now and wired to Postgres server actions next.
- Use this report as the local review trail because no pull request exists yet.

## Shipped

- Operator-domain workflow state machines for `buyer_opportunity`, `supplier_opportunity`, `build`, `run`, `label_batch`, `contract`, `delivery`, and `dsar`.
- License-composition logic that intersects permitted uses, geography, terms, exclusivity, and share-alike constraints before build planning.
- Operator console v0 on `/admin` with all 13 Phase 1 modules, a build-detail reference view, G-1..G-7 gate visualization, simulated five-build queue, license planner result, lineage feed, audit overlay, and state-machine coverage.
- Server action contract for validating operator state transitions and producing audit payloads.
- Self-hosted PostgreSQL operator-core schema baseline and rollback under `db/`.
- Initial Supabase-to-Postgres migration report at `docs/migrations/supabase-to-postgres.md`.
- Blueprint, architecture, and tools docs now describe the Phase 1 target as self-hosted PostgreSQL + Better Auth.
- `docs/blueprints/deviations.md` records the temporary migration and seed-data deviations.
- Typed PostgreSQL client boundary in `lib/db/client.ts` with operator RLS session settings.
- Operator console repository now has explicit `fixture` and `postgres` data sources selected by `OPERATOR_CONSOLE_DATA_SOURCE`.
- tRPC scaffold added at `/api/trpc/[trpc]` for future buyer/supplier surfaces; landing mode still blocks it from the public deployment.
- Postgres-backed operator transitions now perform optimistic state updates and insert `audit_event` rows through the typed repository.
- Added `db/migrations/002_audit_event_default_partition.sql` so audit writes remain durable outside pre-created calendar partitions.

## Deviations

- The slice uses deterministic Phase 1 seed data in code for the console snapshot while the Postgres and Better Auth migration is still pending. This is not final acceptance for "real data" wiring.
- New schema work lands in `db/migrations/*` with matching rollbacks because the goal replaces the legacy Supabase migration path.

## Known Gaps

- Supabase is still the current app data/auth dependency.
- The operator console has replaced the `/admin` home, but old pre-pivot admin subroutes still exist and need deletion/adaptation.
- The local `frontend-design` skill referenced by `AGENTS.md` is not installed in this repo.
- Operator console transition mutations persist only when `OPERATOR_CONSOLE_DATA_SOURCE=postgres`; the default fixture mode still returns non-durable audit payloads during migration.
- The five concurrent builds are simulated in the app layer, not seeded in the Phase 1 Postgres schema.
- Better Auth, mandatory MFA, JIT elevation, and operator-account migration are not implemented yet.
- tRPC scaffold has only a health procedure; buyer/supplier routers remain out of scope for this goal phase.
- Supabase decommissioning is blocked by the required 48-hour post-migration internal-use gate and final-backup confirmation.
- The Postgres schema baseline has not yet been applied to a live database or verified with migrated row counts.

## Verification

- `npx vitest run lib/operator/workflows.test.ts lib/operator/license-composition.test.ts lib/actions/operator-console-actions.test.ts` passed with 11 tests.
- `npx vitest run lib/operator/console-repository.test.ts lib/operator/workflows.test.ts lib/operator/license-composition.test.ts lib/actions/operator-console-actions.test.ts` passed with 16 tests.
- `npm run typecheck` passed.
- `npm run lint` passed with the existing 30 warnings and no errors.
- `npm run lint` passed again after the PostgreSQL client slice with the existing 30 warnings and no errors.
- `npx vitest run lib/trpc/router.test.ts lib/landing-mode.test.ts` passed with 6 tests.
- `npx vitest run lib/operator/console-repository.test.ts lib/actions/operator-console-actions.test.ts` passed with 10 tests after transition persistence.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed after the tRPC scaffold; lint still reports the existing 30 warnings.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed after transition persistence; lint still reports the existing 30 warnings.
- `npm run build` passed.
- `npm run i18n:check-parity` could not run because `scripts/check-i18n-parity.ts` is missing from the repo.
- New operator-console translation JSON was updated manually and parsed successfully.
- `db/migrations/001_operator_core.sql` and `db/rollbacks/001_operator_core_down.sql` applied cleanly against a temporary `supabase/postgres:15.8.1.085` container with pgvector available.
- `db/migrations/001_operator_core.sql`, `db/migrations/002_audit_event_default_partition.sql`, and their rollbacks applied cleanly against a temporary `supabase/postgres:15.8.1.085` container.
