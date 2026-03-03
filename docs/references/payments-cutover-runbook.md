# Payments Cutover Runbook (Self-Hosted Supabase + Stripe)

## Purpose
Operational checklist for launching and sustaining Caudals payment/payout flows in a market-ready state.

## Scope
- Requester funding (`wallet_deposit`, `dataset_funding`)
- Contributor payouts (`submission_payout`)
- Admin reconciliation and anomaly operations
- Ledger consistency, compliance metadata, and webhook reliability

## Preconditions
- `~/.config/caudals/supabase-selfhosted.env` is present locally.
- SSH tunnels are running for DB/MCP:
  - `./scripts/supabase-selfhosted-tunnel.sh start all`
- Stripe sandbox keys and webhook secret are configured in `.env.local`.
- Local migration tree is clean and committed before rollout.

## Cutover Checklist
1. Confirm migration parity with self-hosted DB:
   - `./scripts/supabase-cli-selfhosted.sh migration list`
2. Apply pending migrations (if any):
   - `./scripts/supabase-cli-selfhosted.sh migration up --include-all`
3. Validate payment compliance policy surface:
   - `npm run payments:check-compliance-policies`
4. Validate ledger invariants (must be zero high-severity drift before go-live):
   - `npm run payments:check-ledger`
5. If drift exists, remediate deterministically:
   - dry run: `npm run payments:repair-ledger`
   - apply: `npm run payments:repair-ledger -- --apply --fix-wallet-balances`
   - recheck: `npm run payments:check-ledger`
6. Validate app/runtime contracts:
   - `npm run typecheck`
   - `npm test -- --run app/(app)/api/webhooks/stripe/route.test.ts`
   - `PLAYWRIGHT_AUTH_E2E=true npm run e2e:auth-smoke`
7. Validate webhook ingest path in Stripe sandbox:
   - `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe`
   - trigger matrix:
     - `stripe trigger payment_intent.succeeded`
     - `stripe trigger payment_intent.payment_failed`
     - `stripe trigger transfer.created`
     - `stripe trigger transfer.failed`

## Live Monitoring Checklist
- Admin anomaly surface:
  - `/admin/payments?anomaly=high`
  - `/admin/payments?anomaly=webhook`
  - `/admin/payments?failed=repeated`
- Verify no sustained growth in:
  - failed payout queue
  - stale pending queue (`24h+`)
  - high severity anomalies
- Run periodic automated checks:
  - `npm run payments:check-ledger`
  - `npm run payments:check-compliance-policies`

## Rollback Protocol
1. Trigger rollback when one of these conditions is true:
   - webhook event processing failures recur and cannot be contained,
   - high-severity ledger drift reappears after remediation,
   - payout failures spike and reconciliation actions cannot keep SLA.
2. Contain blast radius immediately:
   - stop autonomous payout/funding jobs and hold operator-initiated payout retries,
   - use `/admin/payments` reconciliation actions to prevent repeated retries on unstable paths.
3. Recover database state:
   - apply forward-fix migration if feasible,
   - if not feasible, restore DB from last known-good backup snapshot.
4. Re-validate before reopening payment traffic:
   - `npm run payments:check-ledger`
   - `npm run payments:check-compliance-policies`
   - webhook replay/idempotency checks through Stripe sandbox triggers.

## Incident Playbooks
### Webhook processing degradation
1. Verify Stripe signing secret and route reachability.
2. Check recent webhook delivery statuses in Stripe dashboard.
3. Confirm `stripe_webhook_events` table exists and accepts writes.
4. Replay failed events after root cause fix.

### Payout queue backlog
1. Triage `/admin/payments` failed + stale queues.
2. Reconcile each failed payout with explicit reason code.
3. Confirm contributor Stripe account readiness for repeated failures.

### Ledger consistency drift
1. Run `npm run payments:check-ledger`.
2. Execute targeted repair (`--apply`, optional `--fix-wallet-balances`).
3. Re-run checker; require `issueCount=0` before closing incident.

## Evidence and Audit Logging
- Record every rollout/incident action in:
  - `docs/logs/changelog/`
  - `docs/logs/validations/`
- Preserve reason codes and notes on admin payout reconciliation actions.
- Do not log secrets or raw sensitive payment payloads.
