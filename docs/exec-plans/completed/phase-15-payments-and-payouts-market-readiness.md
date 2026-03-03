# Phase 15 - Payments and Payouts Market Readiness

- Status: DONE
- Priority: P0
- Owner: autonomous-agent
- Last Updated: 2026-03-03

## Goal

Deliver a production-grade, role-complete payments and payouts system so requesters can reliably fund dataset programs, contributors can receive and track payouts, and admins can operate reconciliation/risk workflows with strong observability and controls.

## Exit Criteria

- Requesters can fund datasets through production-safe payment entrypoints (card and wallet paths) with clear status feedback.
- Contributor payout lifecycle is reliable from submission approval to Stripe transfer settlement with traceable ledger history.
- Admins can monitor/reconcile payout failures and anomalous webhook/transfer states from operational queues.
- Stripe webhook handling is idempotent and complete for core funding/payout event families used in production.
- Billing/earnings history views provide actionable transaction context (amounts, statuses, references, timestamps, receipts where available).
- Security/compliance and audit trails are preserved: no secret leakage, scoped privileged access, and immutable event evidence in logs.
- Validation evidence exists for every completed task, including Stripe sandbox runtime checks and Supabase data verification.

## Queue

- Queue Position: 1
- Blocking Dependencies: none

## Scope Context

- Existing Stripe + Supabase foundations are present (`payment-actions`, webhook route, wallets/transactions/stripe_accounts tables), but requester funding UX remains incomplete and fragmented.
- Requester billing currently lacks market-ready funding controls and complete billing artifacts (for example invoice/receipt views are partial).
- Contributor payout UI exists but requires further hardening for edge-case states, reconciliation signaling, and explicit transfer lifecycle transparency.
- Admin payment operations exist and should be expanded into deeper anomaly triage, retry semantics, and safer operational guardrails.
- Self-hosted Supabase and Stripe sandbox are available for implementation validation in this phase.
- Payment system changes are high-risk and must preserve idempotency, role isolation, and ledger correctness.

## Stages

### S1 - Funding Entry Points and Core UX Activation
- Objective: expose reliable requester funding controls aligned with existing backend primitives and Stripe flows.
- Outputs: requester wallet top-up/card funding entrypoint, dataset funding controls, and guardrails for over-funding/invalid amounts.
- Done when: a requester can complete end-to-end funding in sandbox and see resulting ledger impact.
- Mapped Tasks: `P15-T01`, `P15-T02`

### S2 - Billing and Transaction History Completeness
- Objective: make requester billing and contributor earnings histories operationally useful for finance and support.
- Outputs: richer requester billing history, receipt/reference visibility, improved filtering/status clarity, export-ready data shape.
- Done when: payment/payout history provides sufficient context to resolve common support questions without DB console access.
- Mapped Tasks: `P15-T03`, `P15-T04`

### S3 - Contributor Payout Lifecycle Hardening
- Objective: harden payout initiation and settlement signaling across pending/completed/failed paths.
- Outputs: stricter payout preflight checks, improved failure metadata capture, contributor-facing lifecycle states.
- Done when: payout outcomes are deterministic and retry/reconcile paths are clearly represented in ledger + UI.
- Mapped Tasks: `P15-T05`, `P15-T06`

### S4 - Admin Reconciliation and Risk Operations
- Objective: strengthen admin payment operations for failed payouts, stale queues, and anomaly triage.
- Outputs: enhanced queue operations, anomaly views, action audit notes, and safer remediation workflows.
- Done when: admins can triage and resolve payment incidents without ad hoc SQL.
- Mapped Tasks: `P15-T07`, `P15-T08`

### S5 - Webhook/Event Reliability and Idempotency Expansion
- Objective: close event-consistency gaps for Stripe funding/payout event processing.
- Outputs: expanded event handlers (where needed), replay-safe transitions, and explicit failed-event remediation hooks.
- Done when: webhook replay/order variance does not create duplicate or divergent ledger outcomes.
- Mapped Tasks: `P15-T09`, `P15-T10`

### S6 - Security, Compliance, and Auditability
- Objective: preserve least-privilege and compliance posture while expanding payments functionality.
- Outputs: scoped service-role paths, redacted logging checks, and explicit payment audit trail conventions.
- Done when: payment changes pass security contract and operational evidence standards.
- Mapped Tasks: `P15-T11`, `P15-T12`

### S7 - Market-Readiness Validation and Rollout Protocol
- Objective: validate production readiness in sandbox/staging and capture rollout safeguards.
- Outputs: Stripe sandbox validation checklist, Supabase verification evidence, rollback/retry playbooks, and release checklist.
- Done when: the phase has evidence-backed launch confidence and clear operational runbooks.
- Mapped Tasks: `P15-T13`, `P15-T14`

## Tasks

- [x] `P15-T01` (P0, DONE) Implement requester funding entrypoints (wallet top-up + dataset card funding) with production-safe UX and server actions.
- [x] `P15-T02` (P0, DONE) Add dataset workspace funding controls with budget/remaining validations and explicit funding-state feedback.
- [x] `P15-T03` (P1, DONE) Expand requester billing history with richer payment context (references, receipt pointers, normalized statuses).
- [x] `P15-T04` (P1, DONE) Add billing/account management utilities for requesters (payment method management hooks and ledger export groundwork).
- [x] `P15-T05` (P1, DONE) Harden contributor payout initiation preflight (connect status, currency constraints, minimum transfer safety).
- [x] `P15-T06` (P1, DONE) Improve contributor payout history lifecycle clarity and failure messaging for self-service diagnosis.
- [x] `P15-T07` (P1, DONE) Enhance admin failed/stale payout reconciliation workflows with stronger audit notes and queue actions.
- [x] `P15-T08` (P1, DONE) Add unified payment anomaly correlations across webhook events, transfers, and transaction states.
- [x] `P15-T09` (P0, DONE) Expand webhook reliability coverage for critical funding/payout event variants and replay safety.
- [x] `P15-T10` (P1, DONE) Add automated drift checks/backfill tooling for payment ledger consistency.
- [x] `P15-T11` (P1, DONE) Audit and tighten privileged payment paths, logging redaction, and role boundaries.
- [x] `P15-T12` (P2, DONE) Add finance/compliance metadata extensions required for enterprise payment operations.
- [x] `P15-T13` (P0, DONE) Run Stripe sandbox end-to-end validation suite for requester funding, contributor payout, and admin reconciliation.
- [x] `P15-T14` (P1, DONE) Publish deployment/runbook checklist for payments cutover and operational monitoring.

## Subtasks

- [x] `P15-T01-S01` Add Stripe Checkout server action for requester wallet top-up with secure return URLs and metadata contract.
- [x] `P15-T01-S02` Add Stripe Checkout server action for direct dataset funding with budget cap validation.
- [x] `P15-T01-S03` Wire requester billing UI card for wallet top-up initiation.
- [x] `P15-T02-S01` Add dataset workspace funding panel with wallet and card paths.
- [x] `P15-T02-S02` Enforce client-side amount and remaining-budget guardrails with actionable errors.
- [x] `P15-T02-S03` Refresh funding state/UI after wallet funding success and post-checkout redirect.
- [x] `P15-T03-S01` Extend requester billing action response model for enriched transaction attributes.
- [x] `P15-T03-S02` Add receipt/reference display columns and status badges on requester billing history table.
- [x] `P15-T04-S01` Define payment-method/account-management action contract for requester billing.
- [x] `P15-T04-S02` Add ledger export pathway contract (CSV/API) for requester finance workflows.
- [x] `P15-T05-S01` Add payout preflight guardrails for disabled/invalid Stripe Connect states.
- [x] `P15-T05-S02` Normalize payout error capture into transaction metadata for operational triage.
- [x] `P15-T06-S01` Improve contributor payout timeline rendering for failed/retried/settled transitions.
- [x] `P15-T06-S02` Add contributor-facing remediation guidance for payout blockers.
- [x] `P15-T07-S01` Add stricter admin reconciliation validation and reason codes.
- [x] `P15-T07-S02` Add admin queue filters/sorting for stale, high-value, and repeated-failure payouts.
- [x] `P15-T08-S01` Build anomaly correlation query/action surface combining webhook, transfer, and transaction data.
- [x] `P15-T08-S02` Add quick-link operational drilldowns from admin payments page.
- [x] `P15-T09-S01` Implement missing Stripe event handlers required for reliable state transitions.
- [x] `P15-T09-S02` Add replay/out-of-order handling tests for payment and payout event flows.
- [x] `P15-T09-S03` Add webhook ledger-table-missing fallback so payments continue when `stripe_webhook_events` migration is absent.
- [x] `P15-T10-S01` Add consistency check script for transaction-to-wallet and transaction-to-dataset invariants.
- [x] `P15-T10-S02` Add backfill/remediation command for known drift classes.
- [x] `P15-T11-S01` Audit service-role scopes for payment operations and reduce over-broad scopes.
- [x] `P15-T11-S02` Validate structured-logging redaction on payment/webhook failure paths.
- [x] `P15-T12-S01` Define and add optional compliance fields (tax/legal references) with migration and UI contracts.
- [x] `P15-T12-S02` Add policy checks and docs for compliance-sensitive fields.
- [x] `P15-T13-S01` Execute sandbox funding/payout test matrix and capture evidence in validation logs.
- [x] `P15-T13-S02` Verify Supabase schema/policy behavior for all new payment data paths.
- [x] `P15-T14-S01` Publish rollout, rollback, and incident runbook updates.
- [x] `P15-T14-S02` Close remaining phase tasks and update completed-phase indexes on exit.

## Validation Required

- `npm run typecheck`
- targeted lint/tests for touched payments, billing, webhook, and admin files
- Stripe sandbox runtime checks (funding + payout happy/failure paths)
- Supabase verification for schema/policy behavior on new payment data paths
- docs consistency checks (phase artifacts, changelog, validations, runbook links)

## Evidence Links

- Changelog: `docs/logs/changelog/2026-03-03-phase-15-payments-market-readiness.md`
- Validation: `docs/logs/validations/2026-03-03-phase-15-payments-market-readiness-validation.md`

## Mid-Execution Steering Notes

- Add newly discovered payments scope directly in this phase file before implementing.
- Keep P0 reliability/idempotency tasks ahead of cosmetic/secondary UX tasks.
- If Stripe or Supabase external dependencies block progress, follow blocker escalation protocol and log retries/evidence.
