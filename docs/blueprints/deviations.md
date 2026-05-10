# Blueprint Deviations

## D-001 · Phase 1 migration path

- **Blueprint section:** §05, §28
- **Decision:** New Phase 1 schema work lands in `db/migrations/*` with matching `db/rollbacks/*`.
- **Reason:** The Phase 1 goal replaces Supabase-as-OLTP with self-hosted PostgreSQL. Keeping new platform schema in the legacy `supabase/migrations/*` path would preserve the wrong source of truth.
- **Status:** Accepted for the migration branch; remove this deviation once legacy Supabase files are deleted after the 48-hour decommission gate.

## D-002 · Operator Console v0 data source

- **Blueprint section:** §19, §30 M1
- **Decision:** The first Operator Console slice renders deterministic Phase 1 demo data from app code while the PostgreSQL and Better Auth migrations are still incomplete.
- **Reason:** This enabled UI, workflow, license-composition, and build-detail validation before live data cutover.
- **Status:** Temporary. Final Phase 1 acceptance still requires real PostgreSQL-backed data, durable audit events, RLS, and five seeded concurrent demo builds.
