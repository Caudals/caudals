# Tooling and MCP Reference

## Agent Access Model
Agents can assume access to:
- local repository source code,
- planning context in `docs/PLAN.md` and `docs/exec-plans/`,
- Supabase via self-hosted operational path and MCP (when available),
- browser/devtools tooling for runtime UI validation,
- GitHub tooling for CI and review context.

When interacting with production-like resources, use read-first diagnostics and minimal-risk mutations.

## Primary Tooling
- Terminal: build/test/lint/file ops/repo diagnostics
- Supabase CLI: migrations, schema checks, policy verification
- Supabase MCP: runtime DB inspection and operational queries
- Stripe CLI: webhook forwarding and deterministic event simulation
- Stripe MCP: Stripe object inspection and controlled support operations
- GitHub MCP: issue/PR/review workflows
- GitHub CLI (`gh`): CI run and failed-job log triage
- Chrome DevTools MCP: interaction checks and screenshots

## Tool Selection Matrix
- Schema migrations and drift checks: Supabase CLI
- Ad hoc DB inspection/read queries: Supabase MCP
- Local webhook event simulation: Stripe CLI
- Stripe object lookup/limited write operations: Stripe MCP
- PR/issues/review actions: GitHub MCP
- CI/CD run diagnostics: `gh`
- Frontend QA evidence: Chrome DevTools MCP

## Self-Hosted Supabase Operational Context (Authoritative)
Internal-only runtime context:
- VPS SSH endpoint: `root@161.35.200.8`
- Supabase host path: `/supabase/supabase/docker`
- Common services: db, kong, rest, auth, storage, studio, pooler
- Common exposed ports: `3001`, `8000`, `8443`, `5432`, `6543`

Direct SSH runtime inspection is allowed when MCP context is stale:
- `ssh root@161.35.200.8`

## Supabase CLI Usage Pattern (Self-Hosted)
1. Keep credentials in local secret file (never commit):
   - `~/.config/caudals/supabase-selfhosted.env`
2. Start tunnel(s):
   - `./scripts/supabase-selfhosted-tunnel.sh start db`
   - `./scripts/supabase-selfhosted-tunnel.sh start all`
   - fallback raw tunnel: `ssh -L 55432:127.0.0.1:5432 root@161.35.200.8 -N`
3. Use explicit DB URL (do not rely on `--linked`):
   - `./scripts/supabase-cli-selfhosted.sh migration list`
   - `./scripts/supabase-cli-selfhosted.sh db push --dry-run`
   - `./scripts/supabase-cli-selfhosted.sh db pull`
   - direct CLI fallback:
     - `supabase migration list --db-url \"$SUPABASE_DB_URL\"`
     - `supabase db push --db-url \"$SUPABASE_DB_URL\"`
     - `supabase db pull --db-url \"$SUPABASE_DB_URL\"`

Hard rules:
- For self-hosted targets, `--db-url` is mandatory.
- Prefer `db push --dry-run` before write operations.
- Keep schema changes in `supabase/migrations/*`.
- Never expose DB credentials in docs/logs/screenshots.

## Supabase MCP Usage Pattern (Self-Hosted)
1. Start MCP tunnel:
   - `./scripts/supabase-selfhosted-tunnel.sh start mcp`
2. Verify endpoint:
   - `codex mcp get supabase`
   - expected: `http://127.0.0.1:18100/mcp`
3. Use MCP for read-first diagnostics.
4. Use migration files + CLI for schema-changing work.
5. If MCP context is stale/broken, fallback to SSH + CLI/psql and log fallback evidence.

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
- Avoid live-mode side effects during local validation.
- Preserve webhook idempotency checks in replay/testing.

## Stripe MCP Usage Pattern
1. Prefer `list_*`/search tools before ID-specific fetches.
2. Treat write operations (`create_refund`, `cancel_subscription`, `update_subscription`) as high-risk.
3. Log scope and evidence for payment-impacting writes.
4. Redact customer financial data in docs/logs.

## Chrome DevTools MCP Usage Pattern
1. Navigate to changed route.
2. Validate render and critical interactions.
3. Check console and failed network requests.
4. Capture desktop/tablet/mobile screenshots.
5. Store evidence in `docs/logs/validations/`.

## GitHub CLI (`gh`) Usage Pattern
1. `gh run list`
2. `gh run view <run-id>`
3. `gh run view <run-id> --log-failed`
4. `gh run watch <run-id>`

For failed runs, log run ID, failing job, and key error excerpt in validation/changelog notes.

## Localization Guardrail
For translation-impacting work run:
- `npm run i18n:check-parity`
- optional strict sweep: `npm run i18n:check-parity -- --strict-orphans`

## Sensitive Data Rule
Never include secrets, tokens, private keys, webhook signing secrets, or unredacted financial data in repository docs/logs.

## Local Setup Baseline
Prerequisites:
- Node.js `20+`
- npm `10+`
- Supabase CLI (for migration workflows)

Bootstrap:
1. `npm install`
2. `cp .env.example .env.local`
3. Populate required secrets in `.env.local` (Supabase, Stripe, DO Spaces, Resend).
4. `npm run dev`

## Core Script Catalog
- `npm run dev`: Next.js dev server
- `npm run build`: production build
- `npm run start`: run built app
- `npm run typecheck`: TypeScript checks (`tsc --noEmit`)
- `npm run lint`: ESLint
- `npm test -- --run`: Vitest suite
- `npm run e2e`: Playwright suite
- `npm run e2e:auth-smoke`: authenticated role smoke checks
- `npm run perf:lighthouse`: Lighthouse CI budget check
- `npm run seed`: seed baseline DB data
- `npm run seed:test-fixtures`: deterministic fixture seed
- `npm run fixtures:ensure`: fixture freshness verification/reseed
- `npm run jobs:process-exports`: drain pending export jobs
- `npm run payments:check-ledger`: ledger invariant checks
- `npm run payments:repair-ledger`: dry-run/apply ledger repair
- `npm run payments:check-compliance-policies`: payment policy/RLS checks
- `npm run i18n:check-parity`: EN/ES translation parity checks

## Validation Command Baseline
Minimum merge gate:
- `npm run typecheck`
- `npm test -- --run`
- `npm run lint`

Recommended route-level smoke checks:
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium`

Operational env controls:
- `TEST_FIXTURE_MAX_AGE_HOURS` (default `168`)
- `TEST_FIXTURE_AUTO_RESEED` (default `true`)
- `EXPORT_JOBS_TOKEN` (required for `/api/internal/export-jobs`)

## Environment Variable Categories
- Supabase: URL, anon key, service-role key, JWT settings
- Stripe: publishable key, secret key, webhook secret
- Resend: API key, sender addresses, audience/segment IDs
- DO Spaces: endpoint, region, bucket, access key, secret, CDN URL
- Routing/deploy: app hostnames, marketing hostnames, public app URL, `LANDING_MODE`
- Optional ops: platform fee percent and Stripe test business URL settings

## LANDING_MODE Activation
- `LANDING_MODE` affects both build-time and runtime behavior.
- Build-time: set the GitHub Actions repository secret `LANDING_MODE=true` so `.github/workflows/deploy.yml` passes it into the Docker build. This bakes `NEXT_PUBLIC_LANDING_MODE` into the public bundle.
- Runtime: keep `LANDING_MODE=true` in Dokploy environment variables as well, or ensure Dokploy does not override the image-level value. The server-side proxy reads runtime `LANDING_MODE`.
- Local/dev convenience: `next.config.js` mirrors `LANDING_MODE` into `NEXT_PUBLIC_LANDING_MODE` when the public flag is unset, so `.env.local` can activate the landing surface with just `LANDING_MODE=true`.
- After changing the flag, trigger a fresh image build and let Dokploy pull/redeploy that image. Changing only Dokploy envs is not enough for client-rendered navigation copy; changing only the GitHub secret is not enough if Dokploy overrides runtime envs.

## Troubleshooting Quick Hits
- `Could not find table ... in schema cache`:
  - apply pending migrations,
  - reload PostgREST schema cache,
  - restart API service if needed.
- `Unable to acquire lock at .next/dev/lock` during Playwright:
  - use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` if dev server is already running.
- Stripe webhook failures:
  - verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
  - inspect `stripe_webhook_events` and transaction logs.
- Export jobs stuck in `pending`:
  - verify `EXPORT_JOBS_TOKEN` and scheduler wiring for `/api/internal/export-jobs`,
  - run `npm run jobs:process-exports`.
