# 2026-03-03 - Phase 15 Payments and Payouts Market Readiness

## Scope

- Created and prioritized Phase 15 to drive market-ready payments/payouts delivery.
- Implemented the first P0 slice: requester funding entrypoints and initial funding UX wiring.

## Completed Work

- Added new active phase plan with detailed stages/tasks/subtasks:
  - `docs/exec-plans/active/phase-15-payments-and-payouts-market-readiness.md`
- Updated global/active queue order to prioritize payments phase:
  - `docs/PLAN.md`
  - `docs/exec-plans/active/index.md`
- Added payment debt items scheduled into Phase 15:
  - `docs/exec-plans/tech-debt-tracker.md`

- Implemented Stripe Checkout funding server actions:
  - `lib/actions/payment-actions.ts`
  - `createWalletFundingCheckoutSession(amount, currency)`
  - `createDatasetFundingCheckoutSession(datasetId, amount, currency)`
  - Added `resolveAppOrigin()` helper for return URL construction.
  - Preserved metadata contract consumed by existing webhook handlers (`wallet_deposit`, `dataset_funding`).

- Added requester wallet top-up UX:
  - `components/requester/billing/wallet-funding-card.tsx`
  - integrated into `app/(app)/requester/billing/page.tsx`

- Added dataset-level funding actions in requester workspace:
  - `components/requester/datasets/dataset-workspace.tsx`
  - funding panel with:
    - wallet funding path (`payWithWallet`)
    - card funding path (Stripe Checkout session redirect)
    - amount and remaining-budget guardrails
    - wallet balance loading and post-wallet-funding refresh

## Phase Status Update

- `P15-T01` moved to `DONE`.
- `P15-T02` moved to `IN_PROGRESS` with two subtasks completed (`S01`, `S02`).

## Incremental Update (`P15-T02-S03`, `P15-T09-S01`)

- Added post-checkout funding reconciliation flow with deterministic requester feedback:
  - `lib/actions/payment-actions.ts`
    - new `getFundingCheckoutSessionStatus(sessionId)` server action
    - ownership check (`metadata.user_id`) and normalized funding status response
    - payment confirmation handoff (`confirmPayment`) on settled checkout sessions
  - `components/requester/payments/funding-checkout-status-sync.tsx`
    - reads `funding` / `session_id` URL params
    - verifies checkout status, emits success/pending/error toasts
    - triggers `router.refresh()` and clears query params to prevent duplicate notifications
  - wiring:
    - `app/(app)/requester/billing/page.tsx`
    - `app/(app)/requester/datasets/[id]/page.tsx`

- Expanded Stripe webhook reliability coverage for checkout-driven event variants:
  - `app/(app)/api/webhooks/stripe/route.ts`
    - added handlers for:
      - `checkout.session.completed`
      - `checkout.session.async_payment_succeeded`
      - `checkout.session.async_payment_failed`
    - added payment intent resolution helper for checkout-session events
    - added idempotent guard in `payment_intent.payment_failed` path to avoid duplicate failed transactions
    - refactored payment intent success/failure processing into shared helper functions used by both event families
  - `app/(app)/api/webhooks/stripe/route.test.ts`
    - added test proving failed-payment processing is idempotent when a transaction already exists
    - added checkout-session replay/out-of-order tests to verify deduplication when payment intents are already recorded

- Phase status updates:
  - `P15-T02` moved to `DONE` (all subtasks complete).
  - `P15-T09` moved to `DONE` (`S01` + `S02` complete).

## Incremental Update (`P15-T09-S03`, `P15-T13-S01`, `P15-T13-S02`)

- Executed live Stripe sandbox webhook runtime matrix against local route forwarding (`/api/webhooks/stripe`) and verified Supabase state transitions for:
  - requester wallet funding (`payment_intent.succeeded` + `wallet_deposit` metadata),
  - dataset funding success (`payment_intent.succeeded` + `dataset_funding` metadata),
  - dataset funding failure (`payment_intent.payment_failed`),
  - contributor payout settlement (`transfer.created`).

- Found and fixed two production-significant compatibility gaps:
  - `stripe_webhook_events` table missing in connected self-hosted schema caused all webhook deliveries to fail in `reserveStripeWebhookEvent`.
    - Added runtime fallback to continue processing without dedupe ledger when that table is absent.
    - File: `app/(app)/api/webhooks/stripe/route.ts`
  - `getDatasetBudgetSummary` used PostgREST aggregate alias syntax (`sum(net_amount)`), unsupported in this environment and capable of clobbering `dataset_requests.paid_amount`.
    - Reworked aggregation to row-based summation and added legacy-safe fallback to stored `paid_amount`.
    - File: `lib/actions/payment-actions.ts`

- Added debt tracker item for migration drift / dedupe ledger parity:
  - `TD-010` in `docs/exec-plans/tech-debt-tracker.md`.

- Phase status updates:
  - `P15-T13` moved to `DONE` (`S01`, `S02` complete).
  - Added and completed `P15-T09-S03` (webhook ledger-table fallback).

## Incremental Update (`P15-T03`, `P15-T04`)

- Expanded requester billing overview data contract in `lib/actions/requester-actions.ts`:
  - transaction payload now includes `currency`, `reference_id`, `dataset_request_id`, `submission_id`, normalized status/direction, and parsed `failure_reason`.
  - added `exportRequesterBillingLedgerCsv()` server action (CSV contract with finance-focused fields and failure metadata).

- Added Stripe Billing Portal contract for requester account management:
  - `createRequesterBillingPortalSession(returnPath)` in `lib/actions/payment-actions.ts`.
  - ensures authenticated user + Stripe customer, returns portal redirect URL with safe return path.

- Upgraded requester billing UI in `app/(app)/requester/billing/page.tsx`:
  - richer transaction table columns (scope, reference, details, normalized status badges, currency-aware amounts),
  - integrated new controls card.

- Added new billing controls component:
  - `components/requester/billing/billing-account-controls.tsx`
  - actions:
    - manage payment methods (Billing Portal redirect),
    - download ledger CSV export.

- Debt status updates:
  - `TD-006` and `TD-007` moved to `RESOLVED`.

- Phase status updates:
  - `P15-T03` moved to `DONE`.
  - `P15-T04` moved to `DONE`.

## Incremental Update (`P15-T05`, `P15-T06`)

- Hardened payout initiation preflight in `lib/actions/payment-actions.ts` (`payoutToContributor`):
  - validates non-zero payout input and minimum net transfer amount,
  - validates dataset existence before payout,
  - enforces stronger Stripe account readiness checks (`stripe_account_id`, `details_submitted`, `payouts_enabled`, requirements due, disabled reason),
  - blocks duplicate payout creation when a submission already has pending/completed payout transaction,
  - adds dataset/account currency mismatch guardrails.

- Added payout failure normalization for ops triage:
  - on Stripe transfer failure, writes a `submission_payout` failed transaction with structured metadata (`error_message`, `error_type`, `error_code`, gross/platform fee, account id, transfer currency, submission/dataset references).

- Improved contributor payout lifecycle UX in `app/(app)/contributor/earnings/page.tsx`:
  - surfaces failure reason from payout metadata (`failure_reason` / `error_message` / `transfer_status`),
  - adds explicit remediation panel with actions to update payout settings and return to contributor dashboard.

- Phase status updates:
  - `P15-T05` moved to `DONE`.
  - `P15-T06` moved to `DONE`.

## Incremental Update (`P15-T07`, `P15-T08`)

- Completed admin payout reconciliation hardening in `lib/actions/admin-actions.ts`:
  - finalized reason-code-enforced reconciliation contract:
    - `reconcilePayoutTransaction(transactionId, nextStatus, note, reasonCode)`
    - blocks reconciliation without valid action-specific reason code
    - persists reconciliation audit metadata (`reconciled_at`, `reconciled_by`, `reconcile_reason_code`, `reconcile_note`, `previous_status`)
    - writes structured admin activity log notes with status transition + reason code
  - finalized payout queue enrichment + ops filters in `getAdminPayoutQueues()`:
    - contributor identifier exposure for correlation (`contributor_id`)
    - repeated failure signals (`failure_count_for_contributor`, `is_repeated_failure`)
    - pending age-hour computation for stale sorting
    - strict typed queue row contracts for pending/failed paths

- Implemented unified anomaly correlation action (`P15-T08-S01`):
  - added `getAdminPaymentAnomalies()` in `lib/actions/admin-actions.ts`
  - correlates:
    - payout transaction states (`pending`, `failed`, `completed`)
    - transfer reference integrity (`missing_transfer_reference`, `duplicate_transfer_reference`)
    - contributor repeat-failure patterns
    - webhook processing states and transfer webhook orphan signals when ledger table exists
  - includes safe self-hosted fallback signal:
    - emits `missing_webhook_ledger` anomaly when `public.stripe_webhook_events` is absent.

- Expanded admin payments UI drilldowns (`P15-T08-S02`) in `app/(app)/admin/payments/page.tsx`:
  - added URL-driven anomaly filter controls (`all`, `high`, `payout`, `transfer`, `webhook`)
  - added unified anomaly summary panel and anomaly table with severity/category/title/description/entity/detected time
  - added row-level quick-link drilldowns back into focused queue views
  - aligned pending queue empty-state with active filter result (`pendingRows.length`)
  - preserved existing failed/pending queue filter controls.

- Phase status updates:
  - `P15-T07` moved to `DONE` (`S01`, `S02` complete).
  - `P15-T08` moved to `DONE` (`S01`, `S02` complete).

## Incremental Update (`P15-T10`)

- Added reusable payment-ledger drift engine:
  - `lib/jobs/payment-ledger-consistency.ts`
  - provides:
    - `runPaymentLedgerConsistencyCheck()` for invariant scanning
    - `runPaymentLedgerConsistencyRepair()` for controlled remediation
  - checks implemented:
    - transaction-to-wallet replay consistency (`wallet_missing`, `wallet_balance_mismatch`, `wallet_unbacked_balance`)
    - transaction reference integrity (`tx_dataset_reference_missing`, `tx_submission_reference_missing`)
    - dataset funding ledger consistency for ledger-active datasets (`dataset_paid_amount_mismatch`, `dataset_payment_status_mismatch`, `dataset_budget_overrun`)
  - repair behavior:
    - dry-run by default,
    - supports selective remediation toggles,
    - includes optional wallet balance reconciliation flag.

- Added operator scripts for drift checks and backfill:
  - `scripts/check-payment-ledger-consistency.ts`
    - CI/operator check command
    - non-zero exit on drift unless `--allow-drift` is provided
  - `scripts/backfill-payment-ledger-consistency.ts`
    - remediation command
    - dry-run default; apply with `--apply`
    - optional flags to scope fixes (`--fix-wallet-balances`, skip flags)

- Added npm command wiring:
  - `payments:check-ledger`
  - `payments:repair-ledger`
  - file: `package.json`

- Phase status updates:
  - `P15-T10` moved to `DONE` (`S01`, `S02` complete).

## Incremental Update (`P15-T11`)

- Tightened privileged Supabase admin-client scope contract:
  - `lib/supabase/admin.ts`
  - removed permissive default scope fallback and now requires explicit scope for every `createAdminClient(...)` call.
  - removed `legacy_misc` fallback scope from allowed runtime scope list.
  - outcome: payment and webhook paths can no longer silently use an over-broad default service-role scope.

- Hardened payment failure logging redaction paths:
  - `lib/actions/payment-actions.ts`
  - replaced direct `console.error(...)` usage with `logError(...)` from structured logger across payment onboarding, checkout, funding confirmation, wallet sync, and payout transfer failure paths.
  - ensures sensitive values in Stripe/Supabase errors are run through centralized redaction/masking policy before output.

- Phase status updates:
  - `P15-T11` moved to `DONE` (`S01`, `S02` complete).

## Incremental Update (`P15-T12`, `P15-T14`, Phase Closeout)

- Added enterprise compliance metadata layer for payment operations:
  - migration: `supabase/migrations/025_payment_compliance_records.sql`
    - new `public.payment_compliance_records` table
    - RLS policies for admin/service-role access
    - verifier RPC: `verify_payment_compliance_policy_surface()`
  - policy-check script + npm command:
    - `scripts/check-payment-compliance-policies.ts`
    - `npm run payments:check-compliance-policies`
  - admin action surface:
    - `getAdminPaymentComplianceRecords()`
    - `upsertAdminPaymentComplianceRecord(...)`
    - file: `lib/actions/admin-actions.ts`
  - admin UI workflow:
    - compliance metadata registry panel
    - per-transaction compliance edit workflow from recent transactions
    - file: `app/(app)/admin/payments/page.tsx`

- Resolved self-hosted migration drift for webhook replay ledger:
  - `023_stripe_webhook_events` had been marked applied but table was absent.
  - repaired migration state and re-applied safely with:
    - `./scripts/supabase-cli-selfhosted.sh migration repair 023 --status reverted`
    - `./scripts/supabase-cli-selfhosted.sh migration up --include-all`
  - verified `public.stripe_webhook_events` availability through service-role query.

- Cleared live ledger drift by applying repair workflow:
  - `npm run payments:repair-ledger -- --apply --fix-wallet-balances`
  - repaired 2 findings:
    - one `wallet_balance_mismatch`
    - one `dataset_paid_amount_mismatch`
  - post-repair verification:
    - `npm run payments:check-ledger` => `issueCount=0`.

- Published payments cutover and incident operations runbook (`P15-T14-S01`):
  - new doc: `docs/references/payments-cutover-runbook.md`
  - linked from:
    - `docs/TOOLS.md`
    - `docs/README.md`

- Updated security/schema/debt planning artifacts:
  - `docs/SECURITY.md`
  - `docs/generated/db-schema.md`
  - `docs/exec-plans/tech-debt-tracker.md` (`TD-003`, `TD-008`, `TD-009`, `TD-010` moved to `RESOLVED`)
  - `docs/exec-plans/active/phase-14-export-queue-reliability-and-debt-closure.md` (`P14-T04` marked done via phase-15 delivery)

- Expanded authenticated UI smoke coverage for payment surfaces:
  - `e2e/authenticated-role-smoke.spec.ts`
  - added explicit route checks for:
    - requester billing (`/requester/billing`)
    - contributor earnings (`/contributor/earnings`)
    - admin payments (`/admin/payments`)

- Phase closure updates (`P15-T14-S02`):
  - moved phase file to completed:
    - `docs/exec-plans/completed/phase-15-payments-and-payouts-market-readiness.md`
  - queue/index updates:
    - `docs/PLAN.md`
    - `docs/exec-plans/active/index.md`
    - `docs/exec-plans/completed/index.md`
