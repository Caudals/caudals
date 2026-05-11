# Blueprint Deviations

## D-001 · Phase 1 migration path

- **Blueprint section:** §05, §28
- **Decision:** New Phase 1 schema work lands in `db/migrations/*` with matching `db/rollbacks/*`.
- **Reason:** The Phase 1 goal replaces Supabase-as-OLTP with self-hosted PostgreSQL. Keeping new platform schema in the legacy `supabase/migrations/*` path would preserve the wrong source of truth.
- **Status:** Closed for Phase 1. Legacy Supabase runtime/files were removed after verified encrypted backups; `db/migrations/*` remains the PostgreSQL source of truth.

## D-002 · Operator Console v0 data source

- **Blueprint section:** §19, §30 M1
- **Decision:** The first Operator Console slice renders deterministic Phase 1 demo data from app code while the PostgreSQL and Better Auth migrations are still incomplete.
- **Reason:** This enabled UI, workflow, license-composition, and build-detail validation before live data cutover.
- **Status:** Closed for Phase 1. The deployed console reads PostgreSQL-backed data and retains fixture mode only for local tests.

## D-003 · Labeling module consolidation

- **Blueprint section:** §19, §30 M1
- **Decision:** Earlier Phase 1 slices temporarily exposed `label_batch` under Quality; the console now ships Labeling as a standalone module while keeping embedded Label Studio/CVAT/reviewer workforce flows out of scope for later phases.
- **Reason:** The temporary consolidation kept the first operator-console release narrow while the Postgres and Better Auth cutover was still in progress.
- **Status:** Closed. The Operator Console now exposes a standalone Labeling module for `label_batch` reviewer queues, adjudication depth, create/edit controls, state transitions, and Postgres-backed work items. Embedded Label Studio/CVAT/reviewer workforce operations remain later-phase implementation, but the §19 module map is no longer consolidated into Quality.
