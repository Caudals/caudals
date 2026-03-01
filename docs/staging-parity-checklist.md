# Staging Environment Parity Checklist

Last updated: 2026-03-01  
Owner: Platform engineering  
Scope: `staging` parity against production for release validation

## Goal

Ensure staging is a trustworthy pre-production environment for:
- auth and role routing,
- dataset lifecycle and moderation,
- funding and payout critical paths,
- file uploads/exports,
- and operational observability.

## 1) Host and Routing Parity

- [ ] `NEXT_PUBLIC_APP_URL` points to staging app domain.
- [ ] `NEXT_PUBLIC_MARKETING_URL` points to staging marketing domain.
- [ ] `NEXT_PUBLIC_APP_HOSTNAMES` includes only staging hostnames.
- [ ] Middleware role redirects resolve correctly for requester/contributor/admin.
- [ ] OAuth redirect URLs include staging callback URL.

## 2) Supabase Parity

- [ ] Staging points to dedicated Supabase project/instance (never production DB).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are staging-scoped.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is staging-scoped and rotated.
- [ ] All migrations are applied in staging and schema is current.
- [ ] RLS policies are enabled and validated for key tables:
  - `dataset_requests`
  - `submissions`
  - `support_tickets`
  - `dataset_exports`
  - `transactions`

## 3) Stripe Parity

- [ ] Staging uses Stripe **test mode** keys:
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- [ ] Connect account flows complete in test mode.
- [ ] Webhook endpoint is reachable from Stripe test events.
- [ ] Replay protection table (`stripe_webhook_events`) receives and deduplicates events.
- [ ] Test cards and payout simulation paths are documented for QA.

## 4) Storage Parity (DigitalOcean Spaces)

- [ ] Staging uses a separate bucket/prefix from production.
- [ ] `SPACES_*` env values are staging-specific.
- [ ] Upload API accepts only allowed buckets and MIME types.
- [ ] Signed URL generation for exports works end-to-end.
- [ ] Expiry and retention metadata are present in requester files view.

## 5) Email and Notifications Parity

- [ ] `RESEND_API_KEY` is staging-scoped.
- [ ] Sender domain and `RESEND_AUDIENCE_ID` are configured for staging.
- [ ] Waitlist/collaboration/support emails are delivered to test inboxes.
- [ ] Notification bell counts align with seeded events.

## 6) Analytics and Tracking Parity

- [ ] Funnel events persist to `product_analytics_events`.
- [ ] Admin analytics page renders funnel conversion cards.
- [ ] Tracking endpoint rate limiting is active.
- [ ] Missing analytics infrastructure fails gracefully (no UI crash).

## 7) Security and Compliance Baseline

- [ ] CSP and security headers match production policy intent.
- [ ] Public form abuse controls are active (`/api/waitlist`, `/api/collaborations`).
- [ ] Upload guardrails are enforced in staging.
- [ ] Secrets are sourced from environment and never committed.

## 8) Data and Seed Parity

- [ ] Deterministic fixture seed runs cleanly (`npm run seed:test-fixtures`).
- [ ] Seeded requester/contributor/admin users can authenticate.
- [ ] At least one fixture dataset flows through request -> approve -> fund -> submit -> approve.

## 9) Release Gate (Must Pass)

- [ ] `npm run typecheck`
- [ ] `npm test -- --run`
- [ ] `npm run lint` (warnings reviewed; no errors)
- [ ] `PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test e2e/smoke.spec.ts --project=chromium`
- [ ] `PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium`

## 10) Sign-Off

- [ ] Engineering sign-off
- [ ] Product sign-off
- [ ] Ops sign-off
- [ ] Rollback owner assigned for release window

