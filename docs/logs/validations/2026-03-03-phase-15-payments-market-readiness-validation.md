# 2026-03-03 - Validation Log (Phase 15 Payments and Payouts Market Readiness)

## Automated Checks

1. `npm run typecheck`
- Result: PASS

2. `npx eslint lib/actions/payment-actions.ts app/'(app)'/requester/billing/page.tsx components/requester/datasets/dataset-workspace.tsx components/requester/billing/wallet-funding-card.tsx`
- Result: PASS (warnings only)
- Notes: existing file-level warnings in `lib/actions/payment-actions.ts` for unused eslint-disable directives; no new blocking errors.

3. `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts`
- Result: PASS
- Verified webhook idempotency test suite remains green after new checkout funding entrypoints.

## Functional Validation Notes

- New funding entrypoints are wired to Stripe Checkout server actions and preserve existing webhook metadata contracts:
  - wallet top-up metadata: `type=wallet_deposit`
  - dataset funding metadata: `type=dataset_funding`, `dataset_id`, `user_id`
- Dataset funding panel enforces:
  - positive amount requirement,
  - max-by-remaining-budget guardrail,
  - fully-funded no-op prevention.
- Wallet funding path refreshes wallet state after successful wallet transaction call.

## Incremental Validation (`P15-T02-S03`, `P15-T09-S01`)

1. `npm run typecheck`
- Result: PASS

2. `npx eslint lib/actions/payment-actions.ts components/requester/payments/funding-checkout-status-sync.tsx app/'(app)'/requester/billing/page.tsx app/'(app)'/requester/datasets/'[id]'/page.tsx`
- Result: PASS (warnings only in pre-existing `payment-actions.ts` eslint-disable directives)

3. `npx eslint app/'(app)'/api/webhooks/stripe/route.ts app/'(app)'/api/webhooks/stripe/route.test.ts`
- Result: PASS

4. `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts`
- Result: PASS (8 tests)
- Coverage note: verifies idempotency for:
  - `payment_intent.succeeded` duplicate transaction guard
  - `checkout.session.completed` replay/out-of-order duplicate guard
  - `transfer.created` duplicate transaction guard
  - `payment_intent.payment_failed` duplicate transaction guard

## Functional Validation Notes (Incremental)

- Redirect return URLs carrying `funding` and `session_id` now trigger server-side checkout verification and client-side UI refresh feedback on:
  - `/requester/billing`
  - `/requester/datasets/[id]`
- Successful checkout returns now invoke `confirmPayment` through the new session status action, reducing reliance on webhook timing for immediate UI consistency.
- Webhook processing now covers checkout-session payment outcomes in addition to payment-intent events, improving resilience when only one event family is delivered first.

## Incremental Validation (`P15-T09-S03`, `P15-T13-S01`, `P15-T13-S02`)

1. Runtime setup checks
- `stripe --version` -> PASS
- `supabase --version` -> PASS
- `./scripts/supabase-selfhosted-tunnel.sh status all` -> PASS (MCP and DB tunnels running)
- `./scripts/supabase-cli-selfhosted.sh migration list` -> PASS, but revealed remote migration history is empty (schema drift context).

2. Automated checks after runtime hardening fixes
- `npm run typecheck` -> PASS
- `npx eslint app/'(app)'/api/webhooks/stripe/route.ts` -> PASS
- `npx eslint lib/actions/payment-actions.ts` -> PASS (warnings only; pre-existing unused eslint-disable directives)
- `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts` -> PASS (8 tests)

3. Stripe sandbox runtime matrix (local webhook delivery)
- Listener started:
  - `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe --events payment_intent.succeeded,payment_intent.payment_failed,checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,transfer.created`
- App server started with listener secret in env:
  - `STRIPE_WEBHOOK_SECRET=<listener whsec> npm run dev -- --hostname 127.0.0.1 --port 3000`

- Triggered events:
  - `stripe trigger payment_intent.succeeded ... metadata.type=wallet_deposit` -> delivered `200`, wallet credit transaction inserted.
  - `stripe trigger payment_intent.succeeded ... metadata.type=dataset_funding` -> delivered `200`, dataset funding debit transaction inserted, dataset `paid_amount` advanced.
  - `stripe trigger payment_intent.payment_failed ... metadata.type=dataset_funding` -> delivered `200`, failed transaction inserted with `failure_reason`.
  - `stripe trigger transfer.created ... --override payment_intent:return_url=...` -> delivered `200`, `submission_payout` transaction inserted for contributor + wallet synced.
  - `stripe trigger checkout.session.completed` and `stripe trigger checkout.session.async_payment_failed` -> delivered `200` (handler paths exercised in runtime logs).

4. Supabase verification snapshots
- Pre/post snapshots captured via service-role REST queries (`wallets`, `transactions`, `dataset_requests`).
- Verified outcome rows:
  - requester `wallet_deposit` completed tx with Stripe PI reference,
  - requester `dataset_funding` completed tx rows with dataset metadata,
  - requester `dataset_funding` failed tx row with decline reason,
  - contributor `submission_payout` completed tx row with Stripe transfer reference,
  - funded dataset row updated (`paid_amount`, `payment_status`, `stripe_payment_intent_id`) after success path.

5. Runtime issues discovered and remediated during validation
- Issue A: webhook route failed with `500` because `public.stripe_webhook_events` table missing.
  - Fix: added fallback in webhook POST flow to continue processing without dedupe ledger when table is absent.
  - Result: subsequent event deliveries returned `200`.
- Issue B: dataset budget summary aggregation used unsupported PostgREST aggregate alias syntax causing `fundedCents` to default to `0` and overwrite `paid_amount`.
  - Fix: replaced with row-based aggregation + fallback to stored `dataset_requests.paid_amount`.
  - Result: follow-up dataset funding event advanced `paid_amount` from baseline correctly instead of resetting.

## Remaining Validation Gaps (Updated)

- `stripe_webhook_events` migration drift remains unresolved in the target self-hosted DB; runtime fallback currently preserves operations but disables persisted replay ledger protection. Tracked as `TD-010`.
- Full browser-level requester checkout redirect UX evidence (desktop/tablet/mobile screenshots per UI protocol) is pending a dedicated UI verification slice.

## Incremental Validation (`P15-T03`, `P15-T04`)

1. Automated checks
- `npm run typecheck` -> PASS
- `npx eslint lib/actions/requester-actions.ts app/'(app)'/requester/billing/page.tsx components/requester/billing/billing-account-controls.tsx` -> PASS
- `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts` -> PASS (8 tests)

2. Frontend runtime checks (Chrome DevTools MCP)
- Opened `http://127.0.0.1:3000/requester/billing` in local dev server.
- Route redirected to `auth/sign-in` (expected unauthenticated behavior).
- Console check: no runtime errors; only i18n informational logs.
- Network check: no failed requests for page load assets/routes.

3. Screenshot evidence
- Desktop: `docs/logs/validations/assets/2026-03-03-p15-billing-redirect-desktop.png`
- Tablet: `docs/logs/validations/assets/2026-03-03-p15-billing-redirect-tablet.png`
- Mobile: `docs/logs/validations/assets/2026-03-03-p15-billing-redirect-mobile.png`

4. Functional contract verification
- Billing transaction model now exposes support-grade reference/scope/failure fields via `getRequesterBillingOverview`.
- CSV export contract returns deterministic finance fields and preserves failure metadata.
- Billing portal action returns redirect URL and enforces authenticated requester context.

## Remaining Validation Gaps (Latest)

- Authenticated browser walkthrough for requester billing page (post-login) is still pending; current UI evidence covers unauthenticated redirect behavior only.
- `stripe_webhook_events` migration drift remains open (`TD-010`).

## Incremental Validation (`P15-T05`, `P15-T06`)

1. Automated checks
- `npm run typecheck` -> PASS
- `npx eslint lib/actions/payment-actions.ts app/'(app)'/contributor/earnings/page.tsx` -> PASS (non-blocking pre-existing warnings in `payment-actions.ts`)
- `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts` -> PASS (8 tests)

2. Functional verification notes
- `payoutToContributor` now blocks payout initiation when contributor Stripe account is incomplete/restricted or submission already has pending/completed payout, reducing duplicate/invalid transfer attempts.
- Transfer creation failures now persist structured failure metadata in `transactions` (`submission_payout`, `status=failed`) for admin reconciliation.
- Contributor earnings UI now displays payout failure reason and remediation actions for self-service diagnosis.

## Remaining Validation Gaps (Current)

- Authenticated browser walkthrough for updated contributor payout history remediation UI is pending.
- `stripe_webhook_events` migration drift remains open (`TD-010`).

## Incremental Validation (`P15-T07`, `P15-T08`)

1. Automated checks
- `npm run typecheck` -> PASS
- `npx eslint lib/actions/admin-actions.ts app/'(app)'/admin/payments/page.tsx` -> PASS
- `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts` -> PASS (8 tests)

2. Frontend runtime checks (Chrome DevTools MCP)
- Opened `http://127.0.0.1:3000/admin/payments` in local dev server.
- Route redirected to `auth/sign-in` (expected unauthenticated behavior in this validation context).
- Console check: no runtime errors; only i18n informational logs.
- Network check: no failed requests for page load assets/routes.

3. Screenshot evidence
- Desktop: `docs/logs/validations/assets/2026-03-03-p15-admin-payments-anomaly-desktop.png`
- Tablet: `docs/logs/validations/assets/2026-03-03-p15-admin-payments-anomaly-tablet.png`
- Mobile: `docs/logs/validations/assets/2026-03-03-p15-admin-payments-anomaly-mobile.png`

4. Functional verification notes
- Admin payout reconciliation now enforces action-specific reason codes for retry/cancel transitions and persists audit metadata.
- Admin payout queue now supports stale/high-value/repeated-failure operational filtering with deterministic sorting.
- Unified anomaly action correlates payout transaction states, transfer-reference integrity, and webhook processing state, and surfaces fallback anomaly when webhook ledger table is missing.

## Remaining Validation Gaps (Updated)

- Authenticated browser walkthrough for admin anomaly view is pending; current UI evidence covers unauthenticated redirect behavior only.
- `stripe_webhook_events` migration drift remains open (`TD-010`).

## Incremental Validation (`P15-T10`)

1. Automated checks
- `npm run typecheck` -> PASS
- `npx eslint lib/jobs/payment-ledger-consistency.ts scripts/check-payment-ledger-consistency.ts scripts/backfill-payment-ledger-consistency.ts` -> PASS

2. Script execution checks
- `npm run payments:check-ledger -- --allow-drift` -> PASS (execution successful; drift report generated)
- `npm run payments:repair-ledger` -> PASS (dry-run execution successful; no writes applied)

3. Runtime drift findings from checker
- Current report totals in target environment:
  - `transactionsChecked=15`, `walletsChecked=21`, `datasetsChecked=36`
  - `issueCount=2` (`high=1`, `medium=1`)
- Reported issues:
  - `dataset_paid_amount_mismatch` for dataset `6ac8415d-fab7-4f0e-b48a-6ece7c655fd1`
  - `wallet_balance_mismatch` for user `e17eb4c4-707d-48ee-ae9b-2f609e6be99a`
- Dry-run remediation summary proposed:
  - `datasetPaidAmountsUpdated=1` (if applied)
  - `walletBalancesUpdated=0` by default (requires explicit `--fix-wallet-balances`)

## Remaining Validation Gaps (Current)

- Authenticated browser walkthrough for admin anomaly view is still pending; current UI evidence covers unauthenticated redirect behavior only.
- `stripe_webhook_events` migration drift remains open (`TD-010`).

## Incremental Validation (`P15-T11`)

1. Automated checks
- `npm run typecheck` -> PASS
- `npx eslint lib/actions/payment-actions.ts lib/supabase/admin.ts app/'(app)'/api/webhooks/stripe/route.ts` -> PASS (warnings only for pre-existing unused eslint-disable directives in `payment-actions.ts`)
- `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts` -> PASS (8 tests)

2. Security contract verification notes
- Verified `createAdminClient` now requires explicit scope argument; no callsites compile without declared scope.
- Verified payment action error logging uses structured logger (`logError`) rather than raw `console.error`, so sensitive error payloads are redacted centrally.
- Verified webhook route reliability tests remain green after logging/scope hardening.

## Remaining Validation Gaps (Latest)

- Authenticated browser walkthrough for admin anomaly view is still pending; current UI evidence covers unauthenticated redirect behavior only.
- `stripe_webhook_events` migration drift remains open (`TD-010`).

## Incremental Validation (`P15-T12`, `P15-T14`, Phase Closeout)

1. Compliance migration/policy checks
- `./scripts/supabase-cli-selfhosted.sh migration repair 023 --status reverted` -> PASS
- `./scripts/supabase-cli-selfhosted.sh migration up --include-all` -> PASS (`023_stripe_webhook_events` applied)
- `./scripts/supabase-cli-selfhosted.sh migration list` -> PASS (remote parity through `025`)
- `npm run payments:check-compliance-policies` -> PASS (table exists, all expected policy names present)

2. Webhook ledger availability checks
- Service-role query to `public.stripe_webhook_events` -> PASS (`ok=true`, queryable, zero rows currently)
- Outcome: previous `TD-010` drift condition closed.

3. Ledger consistency remediation and verification
- `npm run payments:repair-ledger -- --apply --fix-wallet-balances` -> PASS
  - applied actions:
    - `walletBalancesUpdated=1`
    - `datasetPaidAmountsUpdated=1`
    - `datasetStatusesUpdated=0`
- `npm run payments:check-ledger` -> PASS (`issueCount=0`)

4. Code quality/runtime checks after final changes
- `npm run typecheck` -> PASS
- `npx eslint app/'(app)'/admin/payments/page.tsx lib/actions/admin-actions.ts scripts/check-payment-compliance-policies.ts e2e/authenticated-role-smoke.spec.ts` -> PASS
- `npm test -- --run app/'(app)'/api/webhooks/stripe/route.test.ts` -> PASS (8 tests)

5. Authenticated role UI/UX flow validation
- `npm run e2e:auth-smoke` -> PASS (4/4 tests)
- Coverage includes payment surfaces:
  - requester: `/requester/billing` heading visibility
  - contributor: `/contributor/earnings` heading visibility
  - admin: `/admin/payments` heading visibility
- Observed non-blocking runtime warnings:
  - `public.product_analytics_events` missing in target schema caused analytics logging errors in console during smoke run.
  - These warnings did not affect payment/payout route behavior or test outcomes.

6. Chrome DevTools MCP authenticated UI verification
- Authenticated manual route checks executed for:
  - `/requester/billing`
  - `/contributor/earnings`
  - `/admin/payments`
- Console/network checks:
  - requester billing: no failed fetch/xhr, only i18n/Fast Refresh logs.
  - contributor earnings: no failed fetch/xhr; one non-blocking warning (`Unable to fetch Stripe balance`, fixture account not connected).
  - admin payments: no failed fetch/xhr, only i18n/Fast Refresh logs.
- Screenshot evidence (authenticated):
  - `docs/logs/validations/assets/2026-03-03-p15-requester-billing-auth-desktop.png`
  - `docs/logs/validations/assets/2026-03-03-p15-requester-billing-auth-mobile.png`
  - `docs/logs/validations/assets/2026-03-03-p15-contributor-earnings-auth-desktop.png`
  - `docs/logs/validations/assets/2026-03-03-p15-contributor-earnings-auth-mobile.png`
  - `docs/logs/validations/assets/2026-03-03-p15-admin-payments-auth-desktop.png`
  - `docs/logs/validations/assets/2026-03-03-p15-admin-payments-auth-mobile.png`

## Remaining Validation Gaps (Final)

- No payment/payout blocking validation gaps remain for Phase 15 scope.
- Non-payment follow-up: create/apply analytics events migration for `public.product_analytics_events` to remove dashboard telemetry warnings during E2E runs.
