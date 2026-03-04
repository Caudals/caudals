# Platform Overview Spec

## Startup Context
Caudals is an AI dataset operations platform connecting:
- ML organizations that need high-quality training datasets,
- contributors who submit data,
- admins who moderate quality, trust, risk, and payouts.

## North Star
Help ML teams procure high-quality datasets faster while giving contributors a trustworthy earning workflow.

## Product Value Axes
- Speed: shorten request-to-approved-dataset cycle time.
- Trust: improve quality, compliance, and payout confidence.
- Control: make requester/admin operations predictable and auditable.

## Primary Outcomes
- Faster dataset throughput
- Higher data quality through review loops
- Reliable contributor payout lifecycle
- Auditable operations for enterprise trust

## Product Surfaces
- Marketing/public (`/`, `/browse`, `/collaborate`, `/landing-simple`)
- Auth and account (`/auth/*`)
- Role applications (`/requester/*`, `/contributor/*`, `/admin/*`)
- Contributor PWA companion (`/pwa/*`)

## Scope (Current)
- Market-ready web app and public funnel
- Auth and role onboarding
- Payments, exports, moderation, and support operations

## Non-Goals (Current)
- Major PWA redesign
- Dark mode rollout
- New data model contracts without explicit phase scope

## KPI Set
- Requester activation: signup -> first request -> funded request
- Contributor throughput: accepted submissions per active contributor
- Operational health: moderation backlog, payout failure rate, support SLA
- Reliability: incident count, failed deploy rate, rollback frequency

## Maturity Map
Mature/production-grade domains:
- dataset CRUD and browse retrieval
- submission review primitives
- admin moderation and role operations
- Stripe funding/payout/webhook flows
- DO Spaces upload/delete pipeline

Partial or risk-prone domains to monitor:
- areas where schema evolution may outpace TS/action contracts
- any remaining mock-heavy analytics/support UX islands
- legacy path assumptions (`/dashboard/*`) reintroduced by new work

## Product Prioritization Heuristics
1. Unblock core marketplace loops first.
2. Prioritize direct KPI lift.
3. De-risk payments, moderation, and data integrity early.
4. Do polish passes after behavior is reliable.
