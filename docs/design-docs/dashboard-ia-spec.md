# Dashboard IA Specification (Cross-Role)

Last updated: 2026-03-01

## IA Principles
- Action-first over metric-first.
- Risk and blockers should appear before long-range analytics.
- Every summary card must have a direct “next step” destination.
- Keep role boundaries strict (`/requester/*`, `/contributor/*`, `/admin/*`).

## Requester IA

### Primary zones
1. `Urgent Work`: review queue, low funding, closing-soon datasets.
2. `Operational Control`: datasets, exports/files, support.
3. `Progress & Health`: KPIs, trend chart, onboarding progress.

### Required entrypoints
- `/requester/datasets?filter=pending_review`
- `/requester/datasets?filter=needs_funding`
- `/requester/files`
- `/requester/support`
- `/requester/datasets/new`

### Empty/error states
- Empty queues should guide to dataset creation.
- Export errors should include retry and failure message.
- Dashboard fetch failures should preserve access to core navigation.

## Contributor IA

### Primary zones
1. `Action Inbox`: needs changes, pending reviews, due items.
2. `Work Surfaces`: browse opportunities, my contributions.
3. `Payout Readiness`: earnings forecast, payout timeline, blockers.

### Required entrypoints
- `/browse`
- `/contributor/contributions`
- `/contributor/earnings`
- `/contributor/settings?tab=payout`

## Admin IA

### Primary zones
1. `SLA Queues`: pending requests/submissions/support.
2. `Operational Signals`: moderation spikes, payout failures, user anomalies.
3. `Controls`: users, settings, featured, activity logs.

### Required entrypoints
- `/admin/requests`
- `/admin/submissions`
- `/admin/support`
- `/admin/payments`
- `/admin/activity`

## Interaction Rules
- All dashboard cards in critical zones must be clickable.
- Use consistent status chips and severity classes across roles.
- Avoid orphaned UI controls (icon-only controls need explicit destinations).
