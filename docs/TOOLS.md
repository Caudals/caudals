# Tooling and MCP Reference

## Agent Access Model

Agents can assume access to:

- local repository source code,
- product and technical context in `docs/product-specs/overview.md` and `docs/`,
- self-hosted PostgreSQL through local Docker, Tailscale, SSH, or Dokploy when credentials are available,
- browser/devtools tooling for runtime UI inspection,
- GitHub tooling for CI and review context.

When interacting with production-like resources, use read-first diagnostics and minimal-risk mutations.

## Primary Tooling

- Terminal: build/lint/file ops/repo diagnostics
- `psql`: SQL migration, rollback, RLS, and schema inspection
- Docker: local integration checks for PostgreSQL and runtime dependencies
- Dokploy: VPS service lifecycle and deployment diagnostics
- Stripe CLI: webhook forwarding and deterministic event simulation when payment code is touched
- Stripe MCP: Stripe object inspection and controlled support operations when payment workflows are active
- GitHub MCP: issue/PR/review workflows
- GitHub CLI (`gh`): CI run and failed-job triage
- Browser/devtools tooling: route rendering, interaction, console, and network inspection

## Evaluation Stage C local checks

Use a disposable local PostgreSQL database and private storage endpoint for integration tests; never point destructive fixtures at the shared production database. Apply migrations 031–042 in order, then exercise tenant queries under a non-owner NOBYPASSRLS role. `npx vitest run tests/evals/stage-c.test.ts` checks website/scenario/customer policy contracts. `npx playwright test --config=e2e/evals/browser-fixture.config.ts` checks isolated browser fixtures, and `npx playwright test --config=e2e/evals/ui.config.ts` checks the invite-only UI harness. Run the two Playwright configs serially because the UI harness binds loopback port 4187. The UI harness does not prove Next.js routing, production network isolation, real widget consent or durable storage.

Before interpreting a queue test failure, verify the installed `pg-boss` version against `package-lock.json`: this local workspace can contain a stale symlink to 10.3.3 while the lockfile specifies 12.33.1. Verify the release with the locked dependency set; do not alter the shared dependency tree merely to hide the mismatch. Stage C release gates are tracked in `docs/evals/work-packages/WP-09.md`–`WP-11.md`.

## Evaluation Stage D local checks

Use `npx vitest run tests/evals/stage-d-*.test.ts` for protocol, calendar and CLI fixtures. For the database tests, provision a disposable PostgreSQL database with migrations 031–042 and a non-owner role inheriting `evals_runtime`; set `EVALS_TEST_DATABASE_URL` to that role and `EVALS_TEST_OWNER_URL` to the disposable migration owner. Run `npx vitest run tests/evals/stage-d-runner-db.test.ts tests/evals/stage-d-monitor-db.test.ts`. These tests insert and update fixtures and must never target production.

Stage D is disabled unless `EVALS_SCHEDULES_ENABLED=true` on the allowlisted general worker. Before enabling it, mount `EVALS_WEBHOOK_KEYRING_FILE` on both web and general worker, set `EVALS_WEBHOOK_KEY_VERSION` on web to a version in that keyring, and provision the Ed25519 `EVALS_RUNNER_SIGNING_KEY` for bundle signing. Keep these out of logs and use mounted secret files where supported. Run `npm run typecheck`, the eval Vitest suite, and the browser fixtures before a release; then exercise a real approved target, worker restart and a customer-controlled webhook receiver. The web UI shows webhook secrets and customer tokens only once. A receiver verifies the exact body with the delivery ID/timestamp signature and records each delivery ID for at least five minutes to reject replay. Keep old webhook secrets accepted until queued deliveries made before rotation have drained.

The private CLI package and adapter usage are in `packages/evals-runner/README.md`. Stage D release evidence and remaining gates are in `docs/evals/work-packages/WP-12.md`–`WP-13.md`.

## Evaluation Stage E local and release checks

Use a disposable PostgreSQL 16 database with migrations 031–044. The fixture runtime login must inherit `evals_runtime` while remaining a non-owner without `SUPERUSER` or `BYPASSRLS`; set `EVALS_TEST_DATABASE_URL` to that login and `EVALS_TEST_OWNER_URL` to the disposable migration owner. Run `npx vitest run tests/evals/stage-e-*.test.ts`, the storage/scoring comparison tests, and `npx playwright test --config=e2e/evals/ui.config.ts`. These fixtures create attributed work and signed releases and must never target production.

Provision a PKCS#8 Ed25519 key through `EVALS_DATASET_SIGNING_KEY_FILE`. The production app deploy script creates a root-only key at `/root/.caudals/app/evals-dataset-signing-key.pem` when absent, validates its type, and mounts a digest-versioned Docker secret at `/run/secrets/evals_dataset_signing_key`; it never places private key bytes in the service environment. With `EVALS_MIGRATION_DATABASE_URL_FILE` pointing at the migration-owner connection, run `npm run evals:release-check-stage-e`. The checker is read-only and passes only when migrations 043–044 exist, the `evals_runtime` group and every login member are least-privileged and own no evaluation objects, required immutable triggers are enabled, the signing key is Ed25519 and `EVALS_EXPERT_WORK_ENABLED=true`. Its output contains identifiers/counts only. Keep key material out of commands, logs and documentation.

Apply migrations with `tsx scripts/evals/migrate.ts`; the migrator holds the `caudals-evals-migrations` advisory lock and verifies checksums on rerun. Both Stage E down files intentionally refuse destructive rollback. Disable the feature flag and forward-repair instead. Rotate signing keys by preserving the old public key/fingerprint for historic customer artifacts, replacing only the mounted private-key secret, rerunning the release check and redeploying an immutable image. Details and acceptance evidence are in `docs/evals/work-packages/WP-14.md`–`WP-15.md`.

## Tool Selection Matrix

- Schema migrations and rollback checks: `psql` against a disposable PostgreSQL container first, then the target database
- Ad hoc DB inspection/read queries: `psql` over Tailscale/SSH tunnel
- Local webhook event simulation: Stripe CLI
- Stripe object lookup/limited write operations: Stripe MCP
- PR/issues/review actions: GitHub MCP
- CI/CD run diagnostics: `gh`
- Frontend runtime inspection: browser/devtools tooling

## PostgreSQL Operational Context

Runtime:

- Target VPS SSH endpoint: `caudals@caudals-1` (Hetzner Tailscale host `100.118.70.90`). Public SSH on `168.119.49.95` is not an operations path.
- PostgreSQL target: private `caudals-postgres` swarm service on `dokploy-network`
- Runtime image: `caudals-postgres:16-pgvector-cron` from `infra/postgres/Dockerfile`
- App service: `caudals-app_app` (Swarm stack `caudals-app`,
  `infra/app-stack.yml`, deployed by `scripts/deploy-app-stack.sh`). Its
  runtime env, including database, Stripe and Resend secrets, is mounted as the
  `app_runtime_env_<digest>` Docker secret at `/run/secrets/app_runtime_env`,
  built from root-only `/root/.caudals/app/credentials.env`. The service's
  start command (`command` in `infra/app-stack.yml`) sources that file with
  `set -a` before `npm run start`, and `scripts/deploy-app-stack.sh` refuses a
  credentials file that does not source cleanly. `docker exec` does not inherit
  that environment: ad-hoc commands must source `/run/secrets/app_runtime_env`
  themselves, and the completion gate's app probes replay the live
  `next-server` process environment instead. The per-secret
  `*_FILE` fallbacks (`DATABASE_URL_FILE`, `BETTER_AUTH_SECRET_FILE`,
  `STRIPE_SECRET_KEY_FILE`, `STRIPE_WEBHOOK_SECRET_FILE`,
  `RESEND_API_KEY_FILE`) remain supported.
- Required extensions for the operator schema: `pgcrypto`, `citext`, `pg_stat_statements`, `vector`, `pg_trgm`, `pg_cron`
- Schema migrations: `db/migrations/*`
- Rollbacks: `db/rollbacks/*`

Direct SSH runtime inspection is allowed when local context is stale:

- `ssh caudals@caudals-1`
- `ssh root@168.119.49.95` is disabled on the Hetzner target; avoid routine root probes because denied root attempts can trigger fail2ban during the migration window

Legacy Supabase containers, images, volumes, network, and host filesystem tree have been decommissioned. Verified encrypted database and filesystem archives are kept under `/root/.caudals/backups`.

If Docker registry access is unavailable, restore the current deployed app image
from the local archive before rescheduling the app service:

- `sha256sum -c /root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz.sha256`
- `gunzip -c /root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz | docker load`

The 2026-06-30 Hetzner migration backup set also contains verified image
archives for `caudals-postgres:16-pgvector-cron`, `mariomedpar/caudals:latest`,
and the deployed orchestration image under
`/root/.caudals/backups/hetzner-migration-20260630T171257Z/images/`.

## Private Dashboard Access

Internal dashboards are Tailscale-only and must never be exposed on the public
interface. On the Hetzner production host (`caudals-1`, Tailscale
`100.118.70.90`) they are served by the `caudals-dashboards` nginx reverse-proxy
container, whose published ports bind **only** to the Tailscale IP (so they have
no public listener); a UFW rule additionally allows `7443:7453` only on
`tailscale0`. Browse from any Tailnet device at `http://caudals-1:<port>`:

| Port | Dashboard | Upstream service |
| --- | --- | --- |
| 7443 | Dokploy | `dokploy:3000` |
| 7444 | Umami (internal only) | `caudals-umami-znhrpr-umami-1:3000` |
| 7445 | Grafana | `caudals-observability_grafana:3000` |
| 7446 | Prometheus | `caudals-observability_prometheus:9090` |
| 7447 | Alertmanager | `caudals-observability_alertmanager:9093` |
| 7448 | Temporal UI (legacy) | `caudals-workflow_ui:8080` |
| 7449 | Dagster (legacy) | `caudals-orchestration_webserver:3000` |
| 7450 | Label Studio (legacy) | `caudals-labeling_label-studio:8080` |
| 7451 | lakeFS (legacy) | `caudals-lakehouse_lakefs:8000` |
| 7452 | Qdrant (`/dashboard`, legacy) | `caudals-vector_qdrant:6333` |
| 7453 | MinIO console | `caudals-object-storage_minio:9001` |

As of 2026-09-11 only Dokploy (scaled to 0 replicas) and Umami have their
upstream stacks on the host; the observability, object-storage and legacy
stacks behind 7445–7453 are not deployed, so those ports have no upstream
until the stack is redeployed.

Proxy config and a redeploy helper live under `/root/.caudals/dashboards/`
(`nginx.conf`, `redeploy.sh`). To add or change a dashboard, edit `nginx.conf`
and run `sudo bash /root/.caudals/dashboards/redeploy.sh`.

CVAT (legacy) is not proxied: its split UI/API/OPA runtime needs host-based
routing, so reach it through an ad-hoc tunnel if ever needed.

The public `analytics.caudals.com` route was removed for security: the Umami
container's Traefik labels were stripped in
`/etc/dokploy/compose/caudals-umami-znhrpr/code/docker-compose.yml`, the
generated `compose-caudals-umami-znhrpr.yml` was deleted, and the container was
recreated (APP_SECRET preserved). Umami is now reachable only via the internal
`7444` dashboard. Consequence: the marketing site's client-side Umami tracking
(`components/legal/site-analytics.tsx` loads
`https://analytics.caudals.com/script.js`, allowlisted in `next.config.js` CSP)
no longer resolves; remove those references and redeploy to stop the dead-script
console errors, or repoint tracking. Custom funnel events fall back to the app's
own `/api/analytics/track`.

Public routing is otherwise unaffected: only `80/443` (web) and `41641/udp`
(Tailscale) are open on the public interface.

The DigitalOcean-to-Hetzner migration completed on 2026-06-30. Production now
runs on the Tailscale hostname `caudals-1` (`168.119.49.95`): Dokploy Traefik
owns public `80/443`, serves valid Let's Encrypt certs, and routes to the local
app, Umami, and private stacks. HAProxy is stopped and disabled (config retained
for rollback). The DigitalOcean VPS remains online as the rollback origin with
verified canonical backups under `/root/.caudals/backups`
(`hetzner-migration-20260630T171257Z` and `hetzner-cutover-<ts>`); do not delete
the droplet or its backups until a human approves decommissioning. Observability
and Umami analytics history were preserved across the move. Agents may install
official Cloudflare and Tailscale CLIs or MCPs when scoped credentials are
available; never print or commit those credentials.

## PostgreSQL Migration Usage Pattern

1. Validate SQL on a disposable database before touching a shared database:
   - `docker run --rm --name caudals-sqlcheck -e POSTGRES_PASSWORD=postgres -p 55433:5432 -d pgvector/pgvector:pg16`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/rollbacks/<file>_down.sql`
   - `docker rm -f caudals-sqlcheck`
2. Apply to integration/production only after review:
   - `docker exec -i $(docker ps --filter label=com.docker.swarm.service.name=caudals-postgres --format '{{.Names}}' | head -n 1) psql -U caudals_app -d caudals -v ON_ERROR_STOP=1 < db/migrations/<file>.sql`
3. Record verification in deployment and phase evidence.

Hard rules:

- Keep schema changes in `db/migrations/*` with matching rollback files in `db/rollbacks/*`.
- Never expose DB credentials in docs, command output, or captured media.
- Do not rely on raw public database ports; use SSH tunnels or Tailscale/private access paths only.
- Do not delete encrypted migration backups unless a newer verified backup exists.

## Better Auth Migration Pattern

1. Use PostgreSQL as the Better Auth adapter target.
2. Keep operator sessions cookie-based, httpOnly, SameSite=Lax, rotating, and refresh-on-use.
3. Allow password-only operator access; keep TOTP and passkeys available as optional hardening.
4. Preserve emails and roles when mapping legacy auth users into operator identity records.
5. Force password reset on first login after migration.
6. Record JIT-elevation events into `audit_event`.

Current scaffold:

- Server config: `lib/auth/better-auth.ts`
- Shared auth options/table mapping: `lib/auth/better-auth-options.ts`
- Client wrapper for future UI migration: `lib/auth/better-auth-client.ts`
- Next.js endpoint: `app/(app)/api/auth/[...all]/route.ts`
- Identity schema migration: `db/migrations/003_better_auth_identity.sql`
- JIT production-DB elevation: `db/migrations/008_operator_elevation.sql`,
  `lib/auth/operator-elevation.ts`, `lib/actions/operator-elevation-actions.ts`,
  `components/admin/operator-elevation-card.tsx`, and
  `OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION=true`
- Delivery signing keys: `lib/actions/signing-key-actions.ts` and
  `components/admin/operator-signing-key-card.tsx`; private keys are encrypted
  before insertion into `signing_key.encrypted_private_key`.
- Cross-module record notes: `db/migrations/010_operator_record_note.sql`,
  `lib/actions/operator-record-note-actions.ts`, and
  `components/admin/operator-record-notes.tsx`; create/update/delete operations
  write `audit_event` rows.
- Generic operator record CRUD: `lib/operator/record-crud.ts`,
  `lib/actions/operator-record-actions.ts`, and
  `components/admin/operator-work-queue.tsx`; descriptor-gated create/update/delete
  operations write `audit_event` rows, with append-only exceptions for immutable
  records.
- Operator security enrollment: `npm run operator:security-status` reports
  MFA/passkey completion and reset-eligible counts without printing emails by
  default. TOTP and passkeys are optional hardening, so password-only operators
  are security-complete by policy. `-- --send-resets` is retained for future
  required-factor policies but should normally be a no-op; reset attempts write
  `audit_event` rows without email addresses in metadata. Use
  `-- --show-emails` only when an admin explicitly needs the pending address
  list.
- Password-reset links default to 30 minutes. Set
  `BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` to a value from `300` to
  `86400` seconds when coordinating migrated operator enrollment needs a longer
  reset window.
- Legacy account migration: `npm run migrate:supabase-auth -- --apply`

Install caveat:

- Better Auth `1.6.x` has optional peer resolution pressure with this repo's Vitest/Vite stack.
  Use `npm install --legacy-peer-deps` when adding or refreshing Better Auth packages until the Vite peer range is reconciled.

## Observability Runtime

- Sentry is wired through `instrumentation.ts`, `instrumentation-client.ts`,
  `app/global-error.tsx`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and
  `lib/observability/sentry-config.ts`; server runtime DSN resolution lives in
  `lib/observability/sentry-server-config.ts`.
- Sentry stays disabled unless `SENTRY_DSN` or the server-only
  `SENTRY_DSN_FILE` Docker secret fallback is set. Keep `sendDefaultPii=false`
  unless a privacy review explicitly approves a change.
- `.env.sentry-build-plugin` is ignored and is only for Sentry source-map
  upload auth. It does not enable runtime error delivery; rotate exposed auth
  tokens before enabling uploads. Source-map upload is additionally gated by
  `SENTRY_SOURCE_MAP_UPLOAD=true` so ordinary builds cannot use a local token
  by accident.
- `npm run observability:sentry-status -- --fail-on-disabled` reports whether
  error delivery is active without printing the DSN, and fails release gates
  when neither DSN source is configured. The runtime Docker image copies this
  plain Node probe so the same command can run inside the deployed app
  container.
- `npm run observability:configure-sentry` creates or mounts a Docker secret for
  `SENTRY_DSN_FILE` on the app service without printing the DSN. Provide
  `CAUDALS_SENTRY_DSN_FILE=/path/to/dsn` when the production DSN is available;
  the script sets `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and sample-rate envs.
- OpenTelemetry traces are registered from
  `lib/observability/opentelemetry.ts`. Set
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://caudals-observability-tempo:4318/v1/traces`
  and `OTEL_SERVICE_NAME=caudals-web` on the app service to export spans to the
  private Tempo service.
- Signal-specific `OTEL_EXPORTER_OTLP_TRACES_HEADERS` and generic
  `OTEL_EXPORTER_OTLP_HEADERS` are supported for OTLP HTTP headers; do not store
  secrets in repository files.
- Optional OpenTelemetry stdout traces remain available when
  `OTEL_STDOUT_ENABLED=true`. The stdout exporter is intended for VPS
  diagnostics and short-lived debugging; do not enable it permanently if logs
  may contain sensitive operational context.
- The private observability stack lives in `infra/observability/` and is
  deployed with `scripts/deploy-observability-stack.sh`. It runs Tempo, Loki,
  Prometheus, Alertmanager, Promtail, cAdvisor, and internal Grafana on
  `dokploy-network` without public published ports.
- `scripts/probe-observability-stack.sh` verifies private readiness endpoints
  for Tempo, Loki, Prometheus, Alertmanager, Promtail, cAdvisor, and Grafana
  from an ephemeral container attached to `dokploy-network`.
- `npm run platform:completion-status` runs the VPS-side completion gate
  against `CAUDALS_APP_SERVICE` (default `caudals-app_app`) and
  `CAUDALS_COMPLETION_BASE_URL` (default `https://caudals.com`). It checks
  landing-mode routing and exact public nav labels, Sentry, operator auth
  policy, the observability stack, object storage, app runtime configuration
  (Stripe, Resend), external alert routing, tracked secret leaks, plaintext
  runtime secret env names and the optional pentest tracker.
- The legacy checks are opt-in: readiness of the eight legacy private stacks,
  the legacy dataset schema, the intake-channel contracts and representative
  G-1–G-7 dataset-build evidence with an accepted buyer delivery run only with
  `CAUDALS_LEGACY_STACKS_GATE_ENABLED=true`, and report under `legacy.*` ids
  (`legacy.dataset_schema`, `legacy.dataset_build`, `legacy.intake_channels`,
  `legacy.cache`, `legacy.labeling`, `legacy.cvat`, `legacy.lakehouse`,
  `legacy.orchestration`, `legacy.workflow`, `legacy.operations`,
  `legacy.vector`). Otherwise the gate prints one `legacy` line saying they
  were skipped.
- As of 2026-09-11 the observability and object-storage stacks are not
  deployed on `caudals-1`, so `observability.stack` and `storage.object_store`
  fail until they are redeployed (or object storage is explicitly waived).
- `npm run platform:runtime-config -- --fail-on-missing` checks the local
  Stripe and Resend runtime variables without printing secret values. The
  platform completion gate runs the same probe inside the deployed app container
  so Docker secret files are checked in their real mount location.
- `scripts/deploy-observability-stack.sh` keeps Alertmanager local/no-op by
  default; set `CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE` or
  `CAUDALS_ALERTMANAGER_WEBHOOK_URL` before redeploying to render a private
  external webhook receiver config outside the repository.
- `npm run observability:configure-alert-routing` validates and deploys that
  external Alertmanager webhook path without printing the webhook URL. Prefer
  `CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE=/path/to/url`.
- Promtail scrapes Docker logs through the Docker socket and labels streams by
  Swarm service name. Prometheus scrapes `alertmanager:9093`, `tempo:3200`,
  `loki:3100`, `promtail:9080`, `cadvisor:8080`, and itself, then sends
  private alerts to Alertmanager. External PagerDuty/on-call contact points
  still require production routing credentials outside the repository.
- Because this repository uses `npm install --legacy-peer-deps`, keep Sentry's
  OpenTelemetry peer packages explicit in `package.json`.

## Object Storage Runtime

- Caudals uses S3-compatible object storage for evaluation reports, run
  archives, JSONL exports, customer document uploads and existing legacy
  artifacts. The single-node VPS runtime can use the private MinIO stack;
  DigitalOcean Spaces remains the managed external target for hosted
  production.
- `npm run object-storage:deploy` deploys the private MinIO stack on
  `dokploy-network`, creates root-only generated credential files under
  `/root/.caudals/object-storage/`, creates matching Docker secrets, ensures the
  bucket exists, and wires the app service to `DO_SPACES_*_FILE` secret
  fallbacks. The production app stack declares the same private endpoint and
  credential-secret mounts so immutable app redeployments preserve that wiring.
- `npm run object-storage:probe` verifies MinIO private health, bucket
  existence, write/read/delete behavior, and no published ports from inside the
  Docker network.
- `npm run storage:probe` validates any externally reachable active
  S3-compatible configuration by writing, reading, and deleting a short private
  object. It requires
  `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`,
  optional `DO_SPACES_FORCE_PATH_STYLE=true` for private compatible stores,
  `DO_SPACES_ACCESS_KEY_ID` or `DO_SPACES_ACCESS_KEY_ID_FILE`,
  `DO_SPACES_SECRET_ACCESS_KEY` or `DO_SPACES_SECRET_ACCESS_KEY_FILE`, and
  `NEXT_PUBLIC_DO_SPACES_CDN_URL`.
- The platform completion gate requires `storage.object_store` by default and
  runs the private MinIO stack write/read/delete probe. Set
  `CAUDALS_OBJECT_STORAGE_GATE_ENABLED=false` only for a documented external
  waiver, or set `CAUDALS_OBJECT_STORAGE_PROBE_MODE=direct` to probe a mounted
  external S3-compatible endpoint instead.
- Useful override variables: `CAUDALS_OBJECT_STORAGE_GATE_ENABLED`,
  `CAUDALS_OBJECT_STORAGE_PROBE_MODE`, `CAUDALS_OBJECT_STORAGE_PROBE_PREFIX`,
  `CAUDALS_OBJECT_STORAGE_STACK_NAME`, `CAUDALS_MINIO_IMAGE`,
  `CAUDALS_MINIO_API_URL`, `CAUDALS_OBJECT_STORAGE_BUCKET`, and
  `CAUDALS_OBJECT_STORAGE_NETWORK`.
- Keep object-storage credentials out of plaintext Docker service env. Use
  `DO_SPACES_ACCESS_KEY_ID_FILE` and `DO_SPACES_SECRET_ACCESS_KEY_FILE` for
  production.

## Legacy Private Stacks

Legacy dataset-build infrastructure, frozen and shut down. The live public
funnel does not call it and new evaluation code must not depend on it;
app-code references are limited to Operator Console snapshot data, the legacy
CLI and frozen operator/supplier modules. When deployed, every stack runs on
`dokploy-network` with no published ports — keep it that way.

Status on `caudals-1` (2026-09-11): none of these stacks is deployed (the
Dagster services were removed on 2026-09-10) and their images were pruned on
2026-09-11. Their named volumes, the `dagster`, `temporal`,
`temporal_visibility`, `marquez` and `lakefs` databases inside
`caudals-postgres`, and their Docker secrets are retained.

| Stack | Scripts | Definition | Secrets and storage | Dashboard |
| --- | --- | --- | --- | --- |
| Dagster orchestration | `orchestration:deploy` / `orchestration:probe` | `infra/orchestration/` | `dagster` DB in `caudals-postgres`; `dagster_postgres_password` | 7449 |
| Temporal workflow | `workflow:deploy` / `workflow:probe` | `infra/workflow/` | `temporal` and `temporal_visibility` DBs in `caudals-postgres`; `temporal_postgres_password` | 7448 |
| Label Studio | `labeling:deploy` / `labeling:probe` | `infra/labeling/` | dedicated Postgres in the stack; `label_studio_postgres_password`, `label_studio_secret_key` | 7450 |
| CVAT | `cvat:deploy` / `cvat:probe` | `infra/labeling/cvat-stack.yml` | own Postgres, Redis, Kvrocks, ClickHouse and OPA | not proxied |
| lakeFS | `lakehouse:deploy` / `lakehouse:probe` | `infra/lakehouse/` | generated secrets under `/root/.caudals/lakehouse/`; local blockstore volume | 7451 |
| Qdrant | `vector:deploy` / `vector:probe` | `infra/vector/` | `qdrant_api_key`; dedicated volume | 7452 |
| Redis | `cache:deploy` / `cache:probe` | `infra/cache/` | `redis_password`; dedicated volume | — |
| Marquez | `operations:deploy` / `operations:probe` | `infra/operations/` | `marquez` DB in `caudals-postgres`; `marquez_postgres_password` | — |

- Deploy scripts create root-only generated secret files under
  `/root/.caudals/<stack>/` when none are supplied, register Docker secrets, and
  never print generated values. Override variables are documented in each
  `scripts/deploy-*-stack.sh`.
- Do not extend these stacks or build on them. The evaluation runner uses a
  Postgres job queue instead (`docs/ARCHITECTURE.md`).
- To restore a stack, get human approval, run its deploy script on
  `caudals-1` (`npm run <stack>:deploy`), and set
  `CAUDALS_LEGACY_STACKS_GATE_ENABLED=true` if the completion gate should
  require it again. The deploy scripts reuse the retained volumes, databases
  and secrets.
- CI no longer builds, pushes or deploys the Dagster image. The last published
  tags are `orchestration-latest` and
  `orchestration-88695970f5aba0bd42090d39a96f0301f0525986` (2026-09-07) in the
  app's Docker Hub repository; `CAUDALS_DAGSTER_BUILD_LOCAL=true npm run
  orchestration:deploy` builds `services/orchestration/` on the host instead.
- Deleting the retained volumes (about 3 GB, mostly CVAT ClickHouse data and
  logs) or the legacy databases is irreversible. It needs separate human
  approval and a verified backup.

## Host Disk Cleanup

`caudals-1` has a 75 GB disk, and every deploy leaves a new image tag behind
(0.9–2.2 GB of unique layers each; Docker's containerd snapshotter keeps them
under `/var/lib/containerd`). `caudals-docker-cleanup.timer` runs
`scripts/host-docker-cleanup.sh` every six hours (00:30, 06:30, 12:30, 18:30
UTC, ±15 min) and removes:

- stopped containers older than 24 h (Swarm keeps one finished task per
  service: `task-history-limit 1`),
- images that are not the current or `PreviousSpec` (rollback) image of any
  Swarm service, not used by any container, not in
  `CAUDALS_CLEANUP_KEEP_REPOSITORIES` (default `caudals-postgres`, which is
  built on the host) and not built or pulled in the last 6 h,
- build cache older than 48 h, and anonymous volumes no container uses (named
  volumes, including the retained legacy ones, are never touched),
- journal beyond 200 MB and crash dumps older than 7 days.

At 90 % or more used it switches to a 1 h image age and prunes all unused build
cache. It exits 2 (the unit shows as failed) when the disk is still at 85 % or
more afterwards, because what remains is in use and needs a person.

- Install or update (from the host checkout, after changing the script):
  `sudo scripts/install-host-docker-cleanup.sh`. The script is copied to
  `/usr/local/sbin/caudals-docker-cleanup`, so deploys never change it.
- Preview: `sudo CAUDALS_CLEANUP_DRY_RUN=true caudals-docker-cleanup`.
- Run now: `sudo systemctl start caudals-docker-cleanup.service`.
- Logs: `journalctl -u caudals-docker-cleanup.service -n 100`.
- Overrides: `CAUDALS_CLEANUP_*` variables in
  `/etc/default/caudals-docker-cleanup` (see the script header).

## Stripe CLI Usage Pattern

1. Use only for local/test webhook simulation.
2. Forward webhooks:
   - `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe`
3. Set emitted `whsec_...` secret in local env.
4. Trigger deterministic events:
   - `stripe trigger payment_intent.succeeded`
   - `stripe trigger payment_intent.payment_failed`
   - `stripe trigger transfer.created` / `transfer.failed` (frozen supplier-payout paths only)

Hard rules:

- Never commit Stripe secrets.
- Avoid live-mode side effects during local review.
- Preserve webhook idempotency checks in replay/debugging.

## Stripe MCP Usage Pattern

1. Prefer `list_*`/search tools before ID-specific fetches.
2. Treat write operations (`create_refund`, `cancel_subscription`, `update_subscription`) as high-risk.
3. Redact customer financial data from docs and user-facing output.

## Browser/Devtools Usage Pattern

1. Navigate to the changed route.
2. Inspect render and critical interactions.
3. Check console and failed network requests.
4. Review responsive behavior when layout changed.

## GitHub CLI (`gh`) Usage Pattern

1. `gh run list`
2. `gh run view <run-id>`
3. `gh run view <run-id> --log-failed`
4. `gh run watch <run-id>`

For failed runs, capture the run ID, failing job, and key error excerpt in the user-facing summary when relevant.

## Vulnerability Management

- `.github/dependabot.yml` checks npm, GitHub Actions, and Dockerfile base-image
  updates weekly.
- `.github/workflows/deploy.yml` runs Docker Scout CVE scanning against the
  pushed image tag and uploads the SARIF file as a workflow artifact without
  printing registry credentials.
- `.github/workflows/security-pentest-schedule.yml` opens or updates a quarterly
  penetration-test tracker issue for Security/CTO execution. Run
  `node scripts/create-pentest-tracker.mjs --dry-run` to preview the issue body
  without touching GitHub.

## Cost Envelope Checks (legacy build budgets)

- `db/migrations/024_build_cost_envelopes.sql` enforces build budget envelopes
  from append-only `cost_entry` rows. Cost entries above the hard build budget,
  LLM sub-budget, or external API sub-budget must carry an override reason; the
  trigger opens alerts and audit rows for soft thresholds, overrides, and margin
  retrospectives.
- Validate changes with a disposable Postgres run of migration `001`, migration
  `002`, migration `024`, a budget-overrun insert attempt, and
  `db/rollbacks/024_build_cost_envelopes_down.sql`.

## Escalation Runbooks

- `db/migrations/025_escalation_runbooks.sql` seeds canonical R-01..R-10
  runbooks and creates `escalation_case`; `027_security_incident_runbooks.sql`
  adds security-specific R-11..R-13 and routes new security events to R-11.
  Inserts auto-route by kind, open an `alert`, and write an `audit_event` for
  the selected runbook/on-call team.
- Validate changes with a disposable Postgres run of migration `001`, migration
  `002`, migration `025`, migration `027`, an escalation insert, and the
  matching rollback before applying to production.

## Security Review Library

- `db/migrations/026_security_review_library.sql` creates
  `security_review_artifact` and seeds public questionnaire answers, DPA
  review-path notes, and security packet items for `/security`.
- Validate changes with a disposable Postgres run of migration `001`, an
  internal organization row, migration `026`, a public artifact readback, and
  `db/rollbacks/026_security_review_library_down.sql`.

## Localization Guardrail

For translation-impacting work run:

- `npm run i18n:check-parity`
- optional strict sweep: `npm run i18n:check-parity -- --strict-orphans`

If the parity script is missing, update `lib/i18n/es.json`, `translations-es.json`, and `translations-source.json` manually and verify the JSON parses.

## Sensitive Data Rule

Never include secrets, tokens, private keys, webhook signing secrets, or unredacted financial data in repository docs or user-facing output.

## Local Setup Baseline

Prerequisites:

- Node.js `20+`
- npm `10+`
- PostgreSQL client tools (`psql`)
- Docker for disposable migration checks

Bootstrap:

1. `npm install`
2. `cp .env.example .env.local`
3. Populate required secrets in `.env.local` (PostgreSQL/Better Auth during migration, Stripe, DO Spaces, Resend).
4. `npm run dev`

## Caudals CLI

- Legacy dataset-build operations CLI, frozen. `npm run caudals -- help`
  lists its commands (build, lineage, license, PII scan, dataset publish,
  delivery signing, DSAR propagation, fixture seeding, intake validation);
  `bin/caudals.mjs` is the package binary shim.
- Commands that need external systems fail closed when configuration is
  missing; `build run` needs a reachable Dagster (`DAGSTER_URL`) unless
  `--dry-run` is set.
- Keep CLI inputs and outputs file-based for auditability. Do not paste secrets
  or private keys into docs, terminal transcripts, screenshots, or user-facing
  summaries.

## Core Script Catalog

- `npm run dev`: Next.js dev server
- `npm run build`: production build
- `npm run start`: run built app
- `npm run typecheck`: TypeScript checks (`tsc --noEmit`)
- `npm run lint`: ESLint
- `npm test -- --run`: Vitest suite
- `npm run e2e`: Playwright suite
- `npm run e2e:auth-smoke`: authenticated admin/buyer/supplier route smoke checks; do not use as a product acceptance signal unless explicitly updating authenticated route behavior
- `npm run perf:lighthouse`: Lighthouse CI budget check
- `npm run seed`: seed baseline DB data
- `npm run seed:test-fixtures`: deterministic fixture seed, including the
  representative delivered dataset build used by the opt-in legacy
  completion-gate checks
- `npm run migrate:supabase-auth`: dry-run legacy Supabase Auth to Better Auth
  operator-account migration; pass `-- --apply` to write rows
- `npm run migrate:public-funnel`: dry-run legacy Supabase public-funnel data migration; pass `-- --apply` to write rows
- `npm run fixtures:ensure`: fixture freshness verification/reseed
- `npm run storage:probe`: probe write/read/delete readiness of the mounted
  S3-compatible object-storage configuration
- `npm run object-storage:deploy`: deploy the private MinIO object-storage
  stack and wire the app service to Docker secret-file fallbacks
- `npm run object-storage:probe`: probe private object-storage health,
  bucket readiness, write/read/delete behavior, and port isolation
- `sudo scripts/install-host-docker-cleanup.sh`: install the periodic Docker
  cleanup timer on `caudals-1` — see Host Disk Cleanup
- Legacy private stacks (frozen): `npm run {cache,labeling,cvat,lakehouse,orchestration,workflow,operations,vector}:deploy`
  and the matching `:probe` scripts — see Legacy Private Stacks
- `npm run caudals`: legacy operations CLI; pass command arguments after `--`
- `npm run i18n:check-parity`: EN/ES translation parity checks

## Useful Route-Level Checks

- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium` only for authenticated admin, buyer, supplier, API, or route-visibility changes

Operational env controls:

- `DATABASE_URL`
- `DATABASE_URL_FILE` (Docker secret-file fallback; `DATABASE_URL` wins when both are set)
- `CAUDALS_TENANT_ORG_ID` (optional tenant RLS scope; defaults to the seeded Caudals tenant id)
- `PUBLIC_BUYER_BRIEF_TENANT_ORG_ID` (optional public buyer-brief intake RLS scope; defaults to `CAUDALS_TENANT_ORG_ID`)
- `PUBLIC_BUYER_BRIEF_INTAKE_ENABLED` (default enabled; set `false` to keep `/contact` email-only)
- `PUBLIC_REST_V1_ENABLED` (default enabled; set `false` to disable `/v1/*`)
- `PUBLIC_REST_CATALOGUE_ENABLED` (default disabled; keeps `/v1/datasets/*` unpublished — the catalogue is out of scope)
- `PUBLIC_REST_V1_TENANT_ORG_ID` (optional `/v1/*` public intake RLS scope; defaults to the public buyer-brief tenant or `CAUDALS_TENANT_ORG_ID`)
- `BUYER_WORKSPACE_V1_ENABLED` (default enabled; set `false` to hide read-only subscription, integration, and billing panels on `/buyer`)
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_SECRET_FILE` (Docker secret-file fallback; `BETTER_AUTH_SECRET` wins when both are set)
- `BETTER_AUTH_URL`
- `BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` (default `1800`, valid range `300`-`86400`)
- `OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT` (legacy; ignored by current code, keep unset or `false`)
- `SUPPLIER_PORTAL_ENABLED` (default enabled; set `false` to hide `/supplier`)
- `SUPPLIER_PORTAL_V1_ENABLED` (default enabled; set `false` to hide read-only payout and Stripe Connect panels on `/supplier`)
- `MODALITY_CONTRACTS_ENABLED` (default enabled; set `false` to block operator modality-contract and enrichment writes)
- `RELEASE_DOCUMENTATION_ENABLED` (default enabled; set `false` to block generated release documentation validation)
- `COMPLIANCE_CONTROL_SCOPING_ENABLED` (default enabled; set `false` to block SOC 2 / ISO 27001 scoping validation)
- `SENTRY_DSN` (enables Sentry when non-empty)
- `SENTRY_DSN_FILE` (server-only Docker secret-file fallback for `SENTRY_DSN`; `SENTRY_DSN` wins when both are set)
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE` (default `0`)
- `SENTRY_PROFILES_SAMPLE_RATE` (default `0`)
- `SENTRY_SOURCE_MAP_UPLOAD` (set `true` only when a valid rotated `SENTRY_AUTH_TOKEN` is available for build-time upload)
- `STRIPE_SECRET_KEY_FILE` / `STRIPE_WEBHOOK_SECRET_FILE` (Docker secret-file fallbacks; direct env vars win when both are set)
- `RESEND_API_KEY_FILE` (Docker secret-file fallback; `RESEND_API_KEY` wins when both are set)
- `DO_SPACES_ENDPOINT`
- `DO_SPACES_REGION`
- `DO_SPACES_BUCKET`
- `DO_SPACES_FORCE_PATH_STYLE` (set `true` for private S3-compatible stores
  that require path-style addressing)
- `DO_SPACES_ACCESS_KEY_ID_FILE` (Docker secret-file fallback;
  `DO_SPACES_ACCESS_KEY_ID` wins when both are set)
- `DO_SPACES_SECRET_ACCESS_KEY_FILE` (Docker secret-file fallback;
  `DO_SPACES_SECRET_ACCESS_KEY` wins when both are set)
- `NEXT_PUBLIC_DO_SPACES_CDN_URL`
- `CAUDALS_LEGACY_STACKS_GATE_ENABLED` (default `false`; set `true` to make
  the completion gate require the frozen legacy stacks and dataset-build
  evidence)
- `CAUDALS_OBJECT_STORAGE_GATE_ENABLED` (default `true`; set `false` only for a
  documented external waiver)
- `CAUDALS_OBJECT_STORAGE_PROBE_MODE` (default `stack`; use `direct` for
  external S3-compatible endpoints)
- `CAUDALS_OBJECT_STORAGE_STACK_NAME` (default `caudals-object-storage`)
- `CAUDALS_OBJECT_STORAGE_NETWORK` (default `dokploy-network`)
- `CAUDALS_OBJECT_STORAGE_BUCKET` (default `caudals-storage`)
- `CAUDALS_MINIO_API_URL` (default `http://caudals-object-storage-minio:9000`)
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (set to Tempo OTLP HTTP in production)
- `OTEL_EXPORTER_OTLP_TRACES_HEADERS` / `OTEL_EXPORTER_OTLP_HEADERS` (optional
  OTLP HTTP headers; do not commit secret values)
- `OTEL_STDOUT_ENABLED` (default disabled; set `true` for short-lived stdout spans)
- `OTEL_SERVICE_NAME` (default `caudals-web`)
- `CAUDALS_OPERATIONS_STACK_NAME` (default `caudals-operations`)
- `CAUDALS_OPERATIONS_NETWORK` (default `dokploy-network`)
- `CAUDALS_MARQUEZ_POSTGRES_SECRET_FILE` (optional server-only password file
  used by `npm run operations:deploy`)
- `TEST_FIXTURE_MAX_AGE_HOURS` (default `168`)
- `TEST_FIXTURE_AUTO_RESEED` (default `true`)

## Environment Variable Categories

- PostgreSQL/Better Auth: `DATABASE_URL` or `DATABASE_URL_FILE`, optional `CAUDALS_TENANT_ORG_ID`, `BETTER_AUTH_SECRET` or `BETTER_AUTH_SECRET_FILE`, `BETTER_AUTH_URL`
- Legacy migration-only auth/data: active runtime no longer uses Supabase; use `LEGACY_SUPABASE_DATABASE_URL` only for explicit one-off migration reruns from a verified legacy backup/source
- Stripe: publishable key, secret key or secret file, webhook secret or secret file
- Resend: API key or secret file, sender addresses, audience/segment IDs
- Object storage: S3-compatible endpoint, region, bucket, access key or
  secret-file fallback, secret key or secret-file fallback, CDN URL, optional
  private MinIO stack variables, object-storage completion-gate waiver flag
- Newsletter (Leads CRM): optional `LEADS_NEWSLETTER_API_URL` override. The
  default is `https://leads.caudals.com/api/newsletter`; it is not a secret.
- Content attribution (Leads CRM): optional `LEADS_ATTRIBUTION_API_URL`
  override. The default is
  `https://leads.caudals.com/api/attribution/public`; it is not a secret.
  Stable content links use `/r/<short-code>`, record a first-party click in the
  CRM, append UTM fields, and carry only opaque journey IDs into the landing
  session. The public site never assigns a CRM identity.
- Routing/deploy: app hostnames, marketing hostnames, public app URL
- Observability: Sentry DSN/environment/release/sample rates,
  OpenTelemetry OTLP trace export to Tempo, and opt-in OpenTelemetry stdout
  export
- Legacy private stacks (frozen): stack, image, service and secret names for
  Dagster, Temporal, Label Studio, CVAT, lakeFS, Qdrant, Redis and Marquez; see
  each `scripts/deploy-*-stack.sh`

## Newsletter Signup Wiring

- The hero box and `/newsletter` both post to `/api/newsletter`. That route only
  rate-limits and validates; the subscriber record, the consent trail and the
  confirmation email belong to the public Leads Node API.
- Signup is **double opt-in**: the API creates a `pending` subscriber and only
  the signed confirmation link makes the address eligible for delivery.
- The archive reads the same narrow Leads API. Neither this site nor its bundle
  receives a PostgreSQL connection, Supabase key or Resend credential.
- Resend credentials live in the secret-backed Leads service, not in this app.

## Public Surface Release Checks

- There is no landing-mode flag. The public site is the landing page and its
  funnel; the removed marketplace pages simply do not exist in the build.
- Cloudflare managed crawler controls can prepend bot-specific rules to the application's `/robots.txt`. After changing crawler policy, verify the production response itself—not only `app/robots.ts`—and configure Cloudflare AI crawler controls so they do not contradict the application's public-content allow rules for search and AI discovery bots.
- SEO/GEO release checks should fetch `/robots.txt`, `/sitemap.xml`, every referenced subsitemap, and `/llms.txt` through the public Cloudflare hostname, then confirm that private routes remain absent.

## Route Surface Gate

- Removed legacy routes stay blocked: `/browse`, `/contributor`, `/dashboard`,
  `/pwa` (the web app manifest points to public landing surfaces only),
  `/requester`, and legacy `/admin/*` subroutes. `/admin` remains the Operator
  Console.
- The pre-pivot marketplace surfaces were deleted and return `404`: `/buyer`,
  `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`,
  `/careers`, `/catalogue`, plus the Stripe webhook, uploads and tRPC API
  routes. `scripts/check-platform-completion.sh` (`check_routes`) asserts it.

## Troubleshooting Quick Hits

- `permission denied for table ...`:
  - confirm `app.current_org_id` and service-role session settings,
  - inspect the table's RLS policy,
  - retry with a read-only query before any mutation.
- `extension "vector" is not available`:
  - use a Postgres image/runtime with pgvector installed,
  - verify `CREATE EXTENSION vector;` on a disposable database before applying migrations.
- `Unable to acquire lock at .next/dev/lock` during Playwright:
  - use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` if dev server is already running.
- `browserType.launch: Executable doesn't exist` during Playwright:
  - run `npx playwright install chromium`,
  - on a fresh VPS, run `npx playwright install-deps chromium` if host libraries are missing.
- `next build` exits through the PTY without diagnostics on the small VPS:
  - rerun as `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` and capture output to a temp log if needed.
- Sentry/Turbopack warns about nested `import-in-the-middle` versions:
  - confirm the build still reaches `Compiled successfully` and finishes the route table,
  - keep `@opentelemetry/instrumentation` explicit unless Sentry changes its peer packaging.
- Stripe webhook failures:
  - verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
  - inspect the `stripe_webhook_event` replay/idempotency table.
