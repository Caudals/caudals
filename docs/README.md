# Caudals

Production-oriented platform for launching and operating dataset programs across three roles:
- requester (dataset creation, funding, exports, support),
- contributor (discovery, submissions, earnings),
- admin (moderation, support queues, analytics, payments oversight).

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase CLI (for migration workflows)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill required values in `.env.local`:
- Supabase URL/keys
- Stripe keys + webhook secret
- DigitalOcean Spaces credentials
- Resend email credentials

4. Start dev server:

```bash
npm run dev
```

## Scripts

- `npm run dev` - run Next.js dev server
- `npm run build` - production build
- `npm run start` - run built app
- `npm run typecheck` - TypeScript checks (`tsc --noEmit`)
- `npm run lint` - ESLint
- `npm test -- --run` - run Vitest test suite
- `npm run e2e` - run Playwright suite
- `npm run e2e:auth-smoke` - authenticated role smoke checks
- `npm run perf:lighthouse` - Lighthouse CI route budget check
- `npm run seed` - seed database baseline
- `npm run seed:test-fixtures` - deterministic fixture seed for local/CI tests
- `npm run fixtures:ensure` - verify fixture users/data freshness and auto-reseed when stale
- `npm run jobs:process-exports` - process queued dataset export jobs
- `npm run payments:check-ledger` - validate payment ledger invariants
- `npm run payments:repair-ledger` - dry-run/apply ledger repair actions
- `npm run payments:check-compliance-policies` - verify compliance table RLS policy surface
- `npm run i18n:check-parity` - verify EN source keys have ES translations (missing-key guardrail)
- `scripts/supabase-selfhosted-tunnel.sh` - start/stop/status SSH tunnels for self-hosted Supabase MCP + DB
- `scripts/supabase-cli-selfhosted.sh` - run Supabase CLI against self-hosted remote DB via tunnel

## Testing and Validation

Minimum gate before merging:

```bash
npm run typecheck
npm test -- --run
npm run lint
```

Recommended route-level smoke validation:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium
```

Fixture freshness controls for authenticated smoke tests:

- `TEST_FIXTURE_MAX_AGE_HOURS` (default `168`)
- `TEST_FIXTURE_AUTO_RESEED` (default `true`)

Internal export worker endpoint auth:

- `EXPORT_JOBS_TOKEN` (required for `/api/internal/export-jobs`)

## Database and Migrations

- Migration files live in `supabase/migrations`.
- Apply and rollback policy is documented in `docs/db-runbook.md`.
- Always apply migrations in staging first and complete parity checks in `docs/staging-parity-checklist.md` before production.

### Self-Hosted Supabase (Agent Workflow)

For this self-hosted deployment, keep agent DB and MCP access on localhost tunnels:

1. Create local secret file (not committed): `~/.config/caudals/supabase-selfhosted.env`
2. Start tunnels:

```bash
./scripts/supabase-selfhosted-tunnel.sh start all
```

3. Run remote migration commands via wrapper:

```bash
./scripts/supabase-cli-selfhosted.sh migration list
./scripts/supabase-cli-selfhosted.sh db push --dry-run
```

4. Codex MCP endpoint for self-hosted Supabase:
- `http://127.0.0.1:18100/mcp` (configured as `mcp_servers.supabase` in `~/.codex/config.toml`)

Detailed CLI/MCP operating rules for Supabase and Stripe are in:
- `docs/references/tooling-and-mcp.md`
- `docs/references/payments-cutover-runbook.md`

## Deployment Notes

- Ensure app and marketing hostnames are configured via:
  - `NEXT_PUBLIC_APP_HOSTNAMES`
  - `NEXT_PUBLIC_MARKETING_HOSTNAMES`
- Stripe webhooks must reach `/api/webhooks/stripe`.
- Keep staging and production secrets isolated.

## Troubleshooting

- `Could not find table ... in schema cache`:
  - apply pending migrations,
  - reload PostgREST schema cache,
  - restart API service if needed.
- `Unable to acquire lock at .next/dev/lock` during Playwright:
  - run with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` if dev server is already running.
- Webhook failures:
  - verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
  - inspect `stripe_webhook_events` and transaction logs.
- Export jobs stuck in `pending`:
  - verify `EXPORT_JOBS_TOKEN` and scheduler wiring for `/api/internal/export-jobs`,
  - run `npm run jobs:process-exports` to drain queue manually.
