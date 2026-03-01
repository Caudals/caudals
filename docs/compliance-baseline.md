# Compliance Notes Baseline (Privacy, Terms, Cookies, DSAR)

Last updated: 2026-03-01  
Task: `S7-T08`

## Public Legal Surface

Current legal pages:

- `/legal/privacy`
- `/legal/terms`
- `/legal/cookies`
- `/trust`

These pages provide customer-facing baseline transparency for data handling, platform terms, cookie usage, and trust posture.

## DSAR Baseline Process

Primary contact:

- `privacy@caudals.com`

Supported request categories:

- Access request
- Rectification request
- Deletion request
- Export request

Process steps:

1. Intake request through support/privacy channel.
2. Verify requestor identity and account ownership.
3. Open internal ticket and assign owner.
4. Scope data systems involved (Supabase profile/workflow/payment metadata as applicable).
5. Execute approved data action with audit trail.
6. Respond to requestor with completion summary.

Target response policy (baseline):

- Acknowledge within 2 business days.
- Complete standard DSAR requests within 30 days unless legally extended.

## Data Classification Snapshot

- Account and profile data
- Workflow operational data (dataset requests, submissions, support)
- Financial operation metadata (transactions, payout status)
- Technical/security telemetry (rate limiting, webhook processing state)

## Compliance Operations Notes

- Apply retention cleanup via `npm run cleanup:expired`.
- Keep migration and rollback safety in `docs/db-runbook.md`.
- Use redacted structured logging per `docs/logging-redaction-policy.md`.
- Review legal copy quarterly or when data flows materially change.

## Gaps and Follow-Ups

1. Add formal DPA/SCC addendum templates for enterprise procurement.
2. Add internal DSAR tracking dashboard with SLA counters.
3. Add policy versioning with changelog references on legal pages.
