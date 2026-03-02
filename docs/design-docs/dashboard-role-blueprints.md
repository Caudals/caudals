# Dashboard Role Blueprints (App.caudals.com)

## Purpose
Define market-ready information architecture, section ownership, and operational flows for requester, contributor, and admin dashboards.

## Shared Shell Rules
- One canonical sidebar system across all roles.
- Explicit top/middle/bottom zoning in sidebar.
- Stable active-state behavior for path + query-driven routes.
- Role switcher available only to admins and must never mutate account role.

## Requester Blueprint
### Sidebar sections
1. Overview
- Dashboard (`/requester`)
2. Datasets
- All datasets (`/requester/datasets`)
- Review queue (`/requester/datasets?filter=pending_review`)
- Funding needed (`/requester/datasets?filter=needs_funding`)
- New dataset (`/requester/datasets/new`)
3. Operations
- Files & exports (`/requester/files`)
- Analytics (`/requester/analytics`)
4. Workspace
- Billing (`/requester/billing`)
- Support (`/requester/support`)
- Onboarding (`/requester/onboarding`)
- Settings (`/requester/settings`)

### Core flows
1. Launch workflow: dashboard -> new dataset -> dataset workspace -> approval/funding.
2. Review workflow: dashboard alerts or review queue -> submissions panel -> approve/reject.
3. Delivery workflow: exports board -> download/expiry management.
4. Operations workflow: billing ledger, support tickets, API/org settings.

## Contributor Blueprint
### Sidebar sections
1. Overview
- Dashboard (`/contributor`)
2. Work
- Contributions (`/contributor/contributions`)
- Browse opportunities (`/browse`)
3. Earnings
- Earnings & payouts (`/contributor/earnings`)
4. Workspace
- Settings (`/contributor/settings`)

### Core flows
1. Work intake: dashboard inbox -> contribution detail -> submit/revise.
2. Earnings confidence: forecast + payout timeline + failed transfer visibility.
3. Profile trust: settings completion and payout readiness.

## Admin Blueprint
### Sidebar sections
1. Overview
- Admin dashboard (`/admin`)
2. Moderation
- Requests (`/admin/requests`)
- Datasets (`/admin/datasets`)
- Submissions (`/admin/submissions`)
- Users (`/admin/users`)
3. Operations
- Payments (`/admin/payments`)
- Support (`/admin/support`)
- Activity (`/admin/activity`)
4. Intelligence
- Analytics (`/admin/analytics`)
- Featured (`/admin/featured`)
- Settings (`/admin/settings`)

### Core flows
1. Moderation queue triage and SLA handling.
2. Payout anomaly resolution and reconciliation.
3. Platform health review via analytics + activity.

## Quality Acceptance
- No incorrect role/view switches during navigation.
- Active menu state always reflects current route/filters.
- All critical role loops reachable in <=2 clicks from role dashboard.
- Responsive consistency across mobile/tablet/desktop.
