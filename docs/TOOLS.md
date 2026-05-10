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
- PostgreSQL target: Dokploy-managed Postgres 16
- Required extensions for the operator schema: `pgcrypto`, `citext`, `pg_stat_statements`, `vector`
- Schema migrations: `db/migrations/*`
- Rollbacks: `db/rollbacks/*`
- Migration report: `docs/migrations/supabase-to-postgres.md`

Direct SSH runtime inspection is allowed when local context is stale:
- `ssh root@ubuntu-caudals`

Legacy Supabase containers may still exist during migration. Do not stop or delete them until the migration report records a successful final encrypted backup and the required 48-hour internal-use gate.

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
   - `docker run --rm --name caudals-sqlcheck -e POSTGRES_PASSWORD=postgres -p 55433:5432 -d supabase/postgres:15.8.1.085`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/rollbacks/<file>_down.sql`
   - `docker rm -f caudals-sqlcheck`
2. Apply to integration/production only after review:
   - `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql`
3. Record verification in `docs/migrations/supabase-to-postgres.md`.

Hard rules:
- Keep schema changes in `db/migrations/*` with matching rollback files in `db/rollbacks/*`.
- Never expose DB credentials in docs, command output, or captured media.
- Do not rely on raw public database ports; use SSH tunnels or Tailscale/private access paths only.
- Do not decommission legacy Supabase services without final-backup evidence and explicit confirmation.

## Better Auth Migration Pattern
1. Use PostgreSQL as the Better Auth adapter target.
2. Keep operator sessions cookie-based, httpOnly, SameSite=Lax, rotating, and refresh-on-use.
3. Enforce TOTP for all operator accounts and WebAuthn for production roles.
4. Preserve emails and roles when mapping legacy auth users into operator identity records.
5. Force password reset on first login after migration.
6. Record JIT-elevation events into `audit_event`.

Current scaffold:
- Server config: `lib/auth/better-auth.ts`
- Shared auth options/table mapping: `lib/auth/better-auth-options.ts`
- Client wrapper for future UI migration: `lib/auth/better-auth-client.ts`
- Next.js endpoint: `app/(app)/api/auth/[...all]/route.ts`
- Identity schema migration: `db/migrations/003_better_auth_identity.sql`

Install caveat:
- Better Auth `1.6.x` has optional peer resolution pressure with this repo's Vitest/Vite stack.
  Use `npm install --legacy-peer-deps` when adding or refreshing Better Auth packages until the Vite peer range is reconciled.

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
- `npm run fixtures:ensure`: fixture freshness verification/reseed
- `npm run jobs:process-exports`: drain pending export jobs
- `npm run payments:check-ledger`: ledger invariant checks
- `npm run payments:repair-ledger`: dry-run/apply ledger repair
- `npm run payments:check-compliance-policies`: payment policy/RLS checks
- `npm run i18n:check-parity`: EN/ES translation parity checks

## Useful Route-Level Checks
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium` only for hidden authenticated-route changes

Operational env controls:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `TEST_FIXTURE_MAX_AGE_HOURS` (default `168`)
- `TEST_FIXTURE_AUTO_RESEED` (default `true`)
- `EXPORT_JOBS_TOKEN` (required for `/api/internal/export-jobs`)

## Environment Variable Categories
- PostgreSQL/Better Auth: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Legacy migration-only auth/data: legacy variables remain until the migration report authorizes removal
- Stripe: publishable key, secret key, webhook secret
- Resend: API key, sender addresses, audience/segment IDs
- DO Spaces: endpoint, region, bucket, access key, secret, CDN URL
- Routing/deploy: app hostnames, marketing hostnames, public app URL, `LANDING_MODE`
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
- Stripe webhook failures:
  - verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
  - inspect webhook replay/idempotency tables.
- Export jobs stuck in `pending`:
  - verify `EXPORT_JOBS_TOKEN` and scheduler wiring for `/api/internal/export-jobs`,
  - run `npm run jobs:process-exports`.
