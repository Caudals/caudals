# Dashboard Role Blueprints

## Purpose
Define role-specific information architecture, flows, and failure-mode guardrails for requester, contributor, and admin dashboards.

## Shared Shell Rules
- One canonical sidebar system across all roles.
- Top/middle/bottom zone split is mandatory.
- Active nav state must reflect route + query state.
- Role switcher is admin-only and must not mutate account role.

## Requester Blueprint
### Jobs to be done
- Launch dataset briefs quickly and confidently.
- Monitor review backlog, funding health, and export readiness.
- Resolve support/billing/org blockers without leaving core workspace.

### IA zones
1. Urgent Work: review queue, low funding, closing-soon datasets
2. Operational Control: datasets, exports/files, support
3. Progress & Health: throughput KPIs and trends

### Required entrypoints
- `/requester`
- `/requester/datasets`
- `/requester/datasets?filter=pending_review`
- `/requester/datasets?filter=needs_funding`
- `/requester/datasets/new`
- `/requester/files`
- `/requester/support`

### Failure modes to prevent
- alerts without direct action destinations,
- hidden funding/review risk,
- export failure states without retry guidance.

## Contributor Blueprint
### Jobs to be done
- Find relevant opportunities quickly.
- Submit work and react to feedback with low friction.
- Track payout readiness and blockers with confidence.

### IA zones
1. Action Inbox: `needs_changes`, pending reviews, due items
2. Work Surfaces: browse opportunities and contributions list
3. Payout Readiness: earnings state, payout timeline, blocker alerts

### Required entrypoints
- `/contributor`
- `/browse`
- `/contributor/contributions`
- `/contributor/earnings`
- `/contributor/settings?tab=payout`

### Failure modes to prevent
- buried review feedback,
- opaque payout status,
- unclear next-highest-impact action.

## Admin Blueprint
### Jobs to be done
- Triage moderation/support queues within SLA.
- Detect platform anomalies and payout risk quickly.
- Execute interventions with auditability.

### IA zones
1. SLA Queues: pending requests/submissions/support
2. Operational Signals: moderation spikes, payout failures, user anomalies
3. Controls: users/settings/featured/activity

### Required entrypoints
- `/admin`
- `/admin/requests`
- `/admin/submissions`
- `/admin/support`
- `/admin/payments`
- `/admin/activity`

### Failure modes to prevent
- queue fragmentation without severity context,
- non-actionable stat blocks,
- delayed visibility into payout/support incidents.

## Shared Interaction Rules
- Critical cards/rows in action zones are always clickable.
- Status chips use consistent severity semantics.
- No icon-only controls without explicit labels/destinations.
- Empty/error states keep users one click away from recovery actions.

## Quality Acceptance
- No incorrect role/view switches during navigation.
- Active menu state always reflects current route/filters.
- Critical role loops reachable in <=2 clicks from dashboard.
- Responsive behavior stable across desktop/tablet/mobile.
