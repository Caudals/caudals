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

## Tool Selection Matrix
- Schema migrations and rollback checks: `psql` against a disposable PostgreSQL container first, then the target database
- Ad hoc DB inspection/read queries: `psql` over Tailscale/SSH tunnel
- Local webhook event simulation: Stripe CLI
- Stripe object lookup/limited write operations: Stripe MCP
- PR/issues/review actions: GitHub MCP
- CI/CD run diagnostics: `gh`
- Frontend runtime inspection: browser/devtools tooling

## PostgreSQL Operational Context
Target Phase 1 runtime:
- VPS SSH endpoint over Tailscale: `root@ubuntu-caudals`
- PostgreSQL target: private `caudals-postgres` swarm service on `dokploy-network`
- Runtime image: `caudals-postgres:16-pgvector-cron` from `infra/postgres/Dockerfile`
- App service: `caudalsdep-caudals-vgbvxp`; database/auth secrets are mounted through `DATABASE_URL_FILE` and `BETTER_AUTH_SECRET_FILE`
- Required extensions for the operator schema: `pgcrypto`, `citext`, `pg_stat_statements`, `vector`, `pg_trgm`, `pg_cron`
- Schema migrations: `db/migrations/*`
- Rollbacks: `db/rollbacks/*`
- Migration report: `docs/migrations/supabase-to-postgres.md`

Direct SSH runtime inspection is allowed when local context is stale:
- `ssh root@ubuntu-caudals`

Legacy Supabase containers, images, volumes, network, and host filesystem tree have been decommissioned. Verified encrypted database and filesystem archives are kept under `/root/.caudals/backups`.

If Docker registry access is unavailable, restore the current deployed app image
from the local archive before rescheduling the app service:
- `sha256sum -c /root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz.sha256`
- `gunzip -c /root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz | docker load`

## Private Dashboard Access
- Dokploy and Umami dashboards are not public.
- Direct Tailscale-only URLs:
  - `http://ubuntu-caudals:7443` for Dokploy
  - `http://ubuntu-caudals:7444` for Umami
- IP fallback:
  - `http://100.92.160.68:7443`
  - `http://100.92.160.68:7444`

## PostgreSQL Migration Usage Pattern
1. Validate SQL on a disposable database before touching a shared database:
   - `docker run --rm --name caudals-sqlcheck -e POSTGRES_PASSWORD=postgres -p 55433:5432 -d pgvector/pgvector:pg16`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/rollbacks/<file>_down.sql`
   - `docker rm -f caudals-sqlcheck`
2. Apply to integration/production only after review:
   - `docker exec -i $(docker ps --filter label=com.docker.swarm.service.name=caudals-postgres --format '{{.Names}}' | head -n 1) psql -U caudals_app -d caudals -v ON_ERROR_STOP=1 < db/migrations/<file>.sql`
3. Record verification in `docs/migrations/supabase-to-postgres.md`.

Hard rules:
- Keep schema changes in `db/migrations/*` with matching rollback files in `db/rollbacks/*`.
- Never expose DB credentials in docs, command output, or captured media.
- Do not rely on raw public database ports; use SSH tunnels or Tailscale/private access paths only.
- Do not delete encrypted migration backups unless a newer verified backup exists.

## Better Auth Migration Pattern
1. Use PostgreSQL as the Better Auth adapter target.
2. Keep operator sessions cookie-based, httpOnly, SameSite=Lax, rotating, and refresh-on-use.
3. Require TOTP enrollment for production operator accounts; keep passkeys available as additional hardening. Fixture accounts remain password-only for smoke tests.
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
  default. TOTP enrollment is required for production operators unless
  `OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT=false` is set for local or
  break-glass use. Add `-- --send-resets` to request fresh reset links for
  required non-fixture operators still missing enrollment; reset attempts write
  `audit_event` rows without email addresses in metadata. Add
  `-- --fail-on-incomplete` only for release gates that intentionally require
  all factors, and `-- --show-emails` only when an admin explicitly needs the
  pending address list.
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
  `sentry.server.config.ts`, `sentry.edge.config.ts`, and
  `lib/observability/sentry-config.ts`; server runtime DSN resolution lives in
  `lib/observability/sentry-server-config.ts`.
- Sentry stays disabled unless `SENTRY_DSN` or the server-only
  `SENTRY_DSN_FILE` Docker secret fallback is set. Keep `sendDefaultPii=false`
  unless a privacy review explicitly approves a change.
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
- `npm run platform:completion-status` runs the VPS-side completion gate for
  landing-mode routing and exact public nav labels, Sentry, operator MFA,
  private observability readiness, external alert routing, tracked Sentry auth
  token leaks, and the current-quarter pentest tracker.
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

## Stripe CLI Usage Pattern
1. Use only for local/test webhook simulation.
2. Forward webhooks:
   - `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe`
3. Set emitted `whsec_...` secret in local env.
4. Trigger deterministic events:
   - `stripe trigger payment_intent.succeeded`
   - `stripe trigger payment_intent.payment_failed`
   - `stripe trigger transfer.created`
   - `stripe trigger transfer.failed`

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

## Cost Envelope Checks
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
  runbooks and creates `escalation_case`. Inserts auto-route by kind, open an
  `alert`, and write an `audit_event` for the selected runbook/on-call team.
- Validate changes with a disposable Postgres run of migration `001`, migration
  `002`, migration `025`, an escalation insert, and
  `db/rollbacks/025_escalation_runbooks_down.sql` before applying to production.

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

## Core Script Catalog
- `npm run dev`: Next.js dev server
- `npm run build`: production build
- `npm run start`: run built app
- `npm run typecheck`: TypeScript checks (`tsc --noEmit`)
- `npm run lint`: ESLint
- `npm test -- --run`: Vitest suite
- `npm run e2e`: Playwright suite
- `npm run e2e:auth-smoke`: hidden authenticated-route smoke checks; do not use as a product acceptance signal for the B2B pivot unless explicitly updating hidden app code
- `npm run perf:lighthouse`: Lighthouse CI budget check
- `npm run seed`: seed baseline DB data
- `npm run seed:test-fixtures`: deterministic fixture seed
- `npm run migrate:supabase-auth`: dry-run legacy Supabase Auth to Better Auth
  operator-account migration; pass `-- --apply` to write rows
- `npm run migrate:public-funnel`: dry-run legacy Supabase public-funnel data migration; pass `-- --apply` to write rows
- `npm run fixtures:ensure`: fixture freshness verification/reseed
- `npm run i18n:check-parity`: EN/ES translation parity checks

## Useful Route-Level Checks
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium` only for hidden authenticated-route changes

Operational env controls:
- `DATABASE_URL`
- `DATABASE_URL_FILE` (Docker secret-file fallback; `DATABASE_URL` wins when both are set)
- `CAUDALS_TENANT_ORG_ID` (optional public catalogue RLS scope; defaults to the seeded Caudals tenant id)
- `PUBLIC_BUYER_BRIEF_TENANT_ORG_ID` (optional public buyer-brief intake RLS scope; defaults to `CAUDALS_TENANT_ORG_ID`)
- `PUBLIC_BUYER_BRIEF_INTAKE_ENABLED` (default enabled; set `false` to keep `/contact` email-only)
- `PUBLIC_REST_V1_ENABLED` (default enabled; set `false` to disable `/v1/*`)
- `PUBLIC_REST_V1_TENANT_ORG_ID` (optional `/v1/*` public catalogue/intake RLS scope; defaults to the public buyer-brief tenant or `CAUDALS_TENANT_ORG_ID`)
- `BUYER_WORKSPACE_V1_ENABLED` (default enabled; set `false` to hide read-only subscription, integration, and billing panels on `/buyer`)
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_SECRET_FILE` (Docker secret-file fallback; `BETTER_AUTH_SECRET` wins when both are set)
- `BETTER_AUTH_URL`
- `BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` (default `1800`, valid range `300`-`86400`)
- `OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT` (default required; set `false` only for local or break-glass password-only operator access)
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
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (set to Tempo OTLP HTTP in production)
- `OTEL_EXPORTER_OTLP_TRACES_HEADERS` / `OTEL_EXPORTER_OTLP_HEADERS` (optional
  OTLP HTTP headers; do not commit secret values)
- `OTEL_STDOUT_ENABLED` (default disabled; set `true` for short-lived stdout spans)
- `OTEL_SERVICE_NAME` (default `caudals-web`)
- `TEST_FIXTURE_MAX_AGE_HOURS` (default `168`)
- `TEST_FIXTURE_AUTO_RESEED` (default `true`)

## Environment Variable Categories
- PostgreSQL/Better Auth: `DATABASE_URL` or `DATABASE_URL_FILE`, optional `CAUDALS_TENANT_ORG_ID`, `BETTER_AUTH_SECRET` or `BETTER_AUTH_SECRET_FILE`, `BETTER_AUTH_URL`
- Legacy migration-only auth/data: active runtime no longer uses Supabase; use `LEGACY_SUPABASE_DATABASE_URL` only for explicit one-off migration reruns from a verified legacy backup/source
- Stripe: publishable key, secret key, webhook secret
- Resend: API key, sender addresses, audience/segment IDs
- DO Spaces: endpoint, region, bucket, access key, secret, CDN URL
- Routing/deploy: app hostnames, marketing hostnames, public app URL, `LANDING_MODE`
- Observability: Sentry DSN/environment/release/sample rates,
  OpenTelemetry OTLP trace export to Tempo, and opt-in OpenTelemetry stdout
  export
- Optional ops: platform fee percent and Stripe test business URL settings

## LANDING_MODE Activation
- `LANDING_MODE=true` is the current public deployment posture.
- `LANDING_MODE` affects both build-time and runtime behavior.
- Build-time: set the GitHub Actions repository secret `LANDING_MODE=true` so `.github/workflows/deploy.yml` passes it into the Docker build. This bakes `NEXT_PUBLIC_LANDING_MODE` into the public bundle.
- Runtime: keep `LANDING_MODE=true` in Dokploy environment variables as well, or ensure Dokploy does not override the image-level value. The server-side proxy reads runtime `LANDING_MODE`.
- Local/dev convenience: `next.config.js` mirrors `LANDING_MODE` into `NEXT_PUBLIC_LANDING_MODE` when the public flag is unset, so `.env.local` can activate the landing surface with just `LANDING_MODE=true`.
- After changing the flag, trigger a fresh image build and let Dokploy pull/redeploy that image. Changing only Dokploy envs is not enough for client-rendered navigation copy; changing only the GitHub secret is not enough if Dokploy overrides runtime envs.

## Phase 1 Surface Gate
- `/browse` is removed and blocked during Phase 1; public marketing navigation no longer links to a marketplace browse surface.
- `/contributor` is removed and blocked during Phase 1; contributor self-service will be redesigned in a later phase.
- `/supplier` is the managed supplier portal exception; it stays authenticated
  and limited to supplier-owned asset declaration, signed sample upload, build
  status, revenue-share payout, and Stripe Connect review while `/contributor`
  remains blocked outside landing mode. It is blocked when `LANDING_MODE=true`.
- `/catalogue` is the M3 catalogue surface; it stays read-only, shows only
  active public listings, sends access requests to `/contact`, and is blocked
  when `LANDING_MODE=true`.
- `/dashboard` is removed and blocked during Phase 1.
- `/pwa` is removed and blocked during Phase 1; the web app manifest now points to public landing surfaces only.
- `/requester` is removed and blocked during Phase 1; buyer/requester self-service will be redesigned in a later phase.
- `/admin/*` legacy subroutes are removed and blocked during Phase 1; `/admin` remains the Operator Console.

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
