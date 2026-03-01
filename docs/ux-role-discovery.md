# Caudals Dashboard UX Discovery (Requester, Contributor, Admin)

Last updated: 2026-03-01

## Requester

### Jobs to be done
- Launch dataset briefs quickly and confidently.
- Monitor collection throughput, review backlog, and funding health.
- Export approved data and resolve operational blockers.

### Daily workflow
1. Check urgent alerts (review backlog, low funding, export readiness).
2. Open dataset queues and process submissions.
3. Trigger exports and verify file availability.
4. Resolve support tickets or update settings/billing.

### Failure modes
- No direct path from alerts to action pages.
- Hidden review/funding risk until datasets stall.
- Export failures without clear retry/error context.

### UX requirements
- Dashboard must prioritize urgent actions above passive analytics.
- Every alert card must map to one actionable destination.
- Files/export/supported workflows must be one-click reachable.

## Contributor

### Jobs to be done
- Find suitable datasets fast.
- Track review feedback and resubmit quickly.
- Understand payout readiness and blockers.

### Daily workflow
1. Check action inbox (`needs_changes`, pending reviews).
2. Continue work on active contributions.
3. Verify payouts/earnings and Stripe account readiness.

### Failure modes
- Feedback buried inside contribution details.
- No clear payout forecast or payout blocker visibility.
- Hard to prioritize the highest-impact next task.

### UX requirements
- Action inbox must be visible from dashboard.
- Payout timeline + blockers must be explicit.
- Quick links to browse, resubmit, and earnings pages.

## Admin

### Jobs to be done
- Triage moderation queues and support escalations.
- Detect platform anomalies quickly.
- Execute high-confidence interventions with auditability.

### Daily workflow
1. Review pending requests/submissions/support queues.
2. Inspect activity and anomaly indicators.
3. Resolve payout and moderation exceptions.

### Failure modes
- Queue fragmentation across pages without priority context.
- Non-actionable “stats-only” blocks.
- Delayed response to payout/support incidents.

### UX requirements
- Dashboard must surface SLA queues with direct links.
- Anomaly cards should prioritize by severity.
- All high-risk items should be reachable in one click.
