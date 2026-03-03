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

## Database and Migrations

- Migration files live in `supabase/migrations`.
- Apply and rollback policy is documented in `docs/db-runbook.md`.
- Always apply migrations in staging first and complete parity checks in `docs/staging-parity-checklist.md` before production.

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
