# Caudals Platform Context for LLMs and Autonomous Agents

## 1. Document Purpose
This is the official high-context briefing for AI agents working on Caudals.

Use this document to:
- Understand what Caudals is and why it exists.
- Understand the full technical architecture in this repo.
- Safely plan, implement, and validate new features autonomously.
- Prioritize work based on actual platform maturity.

This document is intentionally implementation-oriented, not marketing-only.

## 2. Startup and Product Overview
### 2.1 What Caudals is
Caudals is an AI dataset operations platform that connects:
- Organizations/ML teams that need structured, labeled training datasets.
- Contributors who submit data samples.
- Admin operators who govern quality, approvals, risk, and payments.

Core business value:
- Faster dataset collection at production scale.
- Quality control through review workflows.
- Payment and payout automation (Stripe + internal ledger).
- Operational visibility for requesters and admins.

### 2.2 Product surfaces
The product has 3 main surfaces:
- Marketing/public surface (landing page, caudals.com) (`/`, `/browse`, `/collaborate`, `/landing-simple`).
- Auth and account surface (`/auth/*`).
- Role-based application surface (dashboards and web app, app.caudals.com) (`/requester/*`, `/contributor/*`, `/admin/*`).

There is also a mobile-first PWA contributor companion under `/pwa/*`.

## 3. Role Model (3 Roles)
Caudals currently operates with 3 canonical roles:

1. `requester`
- Creates and manages dataset requests (briefs).
- Funds/pays datasets.
- Reviews incoming submissions and exports approved data.
- Manages org/profile/API keys/support tickets.

2. `contributor`
- Browses approved/funded opportunities.
- Uploads files and submits contributions.
- Tracks statuses and earnings.
- Configures Stripe Connect payout details.

3. `admin`
- Approves/rejects dataset requests.
- Reviews submissions and can trigger payout side-effects on approval.
- Manages users, settings, featured datasets, analytics/payments views.
- Oversees moderation and platform-level controls.

Role enforcement exists in middleware and server-side route guards.

## 4. High-Level Architecture
### 4.1 Application stack
- Framework: Next.js App Router (`next@16`).
- Language: TypeScript.
- UI: React 19 + Tailwind CSS v4 + Radix UI + custom components + Shadcn.
- Auth/data backend: Supabase (Auth + Postgres + RLS).
- Payments: Stripe + Stripe Connect.
- Email/comms: Resend.
- File storage: DigitalOcean Spaces (S3-compatible) + CDN URL.
- PWA: custom service worker + dedicated mobile shell.

### 4.2 App topology
- `app/(home)/*`: public marketing and browse experiences.
- `app/(auth)/*`: sign-in/up/callback/reset flows.
- `app/(app)/*`: authenticated app and APIs.
- `components/*`: UI and domain components by area.
- `lib/actions/*`: server actions (business logic layer).
- `lib/supabase/*`: clients and middleware session integration.
- `supabase/migrations/*`: schema history.

### 4.3 Hostname split and route behavior
Middleware supports app/marketing host split:
- App hostnames via `NEXT_PUBLIC_APP_HOSTNAMES`.
- Marketing hostnames via `NEXT_PUBLIC_MARKETING_HOSTNAMES`.

Special behavior:
- `/dashboard` is a smart role entrypoint, not a full workspace.
- `/dashboard/*` subroutes are deprecated and redirected to `/dashboard`.
- In `LANDING_MODE=true`, most routes redirect to `/landing-simple` (except APIs/assets).

## 5. Infrastructure and Deployment
### 5.1 Runtime infrastructure (production)
Per platform contract:
- Hosted on a DigitalOcean VPS.
- Dokploy orchestrates deployment/runtime.
- Docker Hub stores built images.
- GitHub Actions builds and pushes on `main`.

### 5.2 CI/CD flow implemented in repo
GitHub workflow: `.github/workflows/deploy.yml`
- Trigger: push to `main` (and manual dispatch).
- Builds Docker image from `Dockerfile`.
- Pushes tags to Docker Hub (`latest` and commit SHA).
- Passes all required build args (Supabase, Stripe, Resend, DO Spaces, landing mode).

### 5.3 Docker
`Dockerfile` is multi-stage:
- `deps` stage installs dependencies.
- `build` stage runs `npm run build` with env/build args.
- `runtime` stage runs minimal prod dependencies + `.next` output.

### 5.4 Self-Hosted Supabase Access (Authoritative)
Caudals uses a self-hosted Supabase stack on a DigitalOcean VPS.

- VPS SSH: `root@161.35.200.8`
- SSH access from agent environment: verified (key-based) on `2026-03-01`.
- Supabase stack host path: `/supabase/supabase/docker`
- Observed core containers: `supabase-db`, `supabase-kong`, `supabase-rest`, `supabase-auth`, `supabase-storage`, `supabase-studio`, `supabase-pooler`.
- Observed exposed ports on host:
  - Studio: `3001`
  - Kong API gateway: `8000` (and `8443`)
  - Supavisor pooler: `5432` and `6543`

Use this VPS as the source of truth for DB/runtime checks when Supabase cloud MCP context is stale or not configured for this project.

#### 5.4.1 CLI/MCP Operational Notes
- Prefer direct SSH for infra/runtime inspection:
  - `ssh root@161.35.200.8`
- Prefer DB operations through an SSH tunnel when running local Supabase CLI:
  1. `ssh -L 55432:127.0.0.1:5432 root@161.35.200.8 -N`
  2. Build `SUPABASE_DB_URL` from VPS Supabase credentials (do not commit secrets).
  3. Run CLI commands with explicit DB URL:
     - `supabase migration list --db-url "$SUPABASE_DB_URL"`
     - `supabase db push --db-url "$SUPABASE_DB_URL"`
     - `supabase db pull --db-url "$SUPABASE_DB_URL"`
- If MCP Supabase tools return timeouts or wrong project context, fallback to SSH + CLI/psql against this VPS instance.

## 6. Data, DB, and Storage
### 6.1 Supabase database
Schema evolves via `supabase/migrations/001..020`.

Core entities:
- `profiles`
- `dataset_requests`
- `submissions`

Admin/operations:
- `admin_activity_log`
- `platform_settings`
- `waitlist_signups`

Payments/ledger:
- `wallets`
- `transactions`
- `stripe_accounts`

Requester-overhaul entities:
- `dataset_templates`
- `dataset_activity`
- `dataset_exports`
- `requester_onboarding_progress`
- `requester_org_settings`
- `requester_api_keys`
- `support_tickets`

### 6.2 Supabase security model
- RLS is enabled broadly in schema.
- Policy coverage exists for core ownership and role cases.
- App uses both user-scoped clients and service-role/admin clients.

Important: when writing new server actions, preserve RLS assumptions and avoid bypassing ownership checks unless explicitly using admin/service operations.

### 6.3 Object storage
Current file upload implementation is DigitalOcean Spaces:
- Client upload helper posts to `/api/upload`.
- API route uploads/deletes through AWS S3 SDK to Spaces.
- Public URLs built using `NEXT_PUBLIC_DO_SPACES_CDN_URL`.

Legacy Supabase storage policy script exists (`scripts/setup-storage.sql`) and some storage migration artifacts remain for backward compatibility.

## 7. Payment and Payout Architecture
Payments are one of the most mature backend areas.

### 7.1 Requester funding
- Requester creates Stripe PaymentIntent for:
  - wallet funding (`wallet-funding`), or
  - specific dataset funding.
- On confirmation/webhook success:
  - transaction rows are recorded.
  - dataset payment status (`unpaid|partial|paid`) is updated.
  - funded amount tracking updates dataset state.

### 7.2 Contributor payouts
- Contributor Stripe Connect custom account onboarding is supported.
- Admin approval of eligible submissions can trigger payout flow.
- Payouts go through Stripe transfer to connected account.
- Platform fee logic applies (default 10% via env fallback).
- Wallet/ledger sync routines reconcile balances.

### 7.3 Webhooks
`/api/webhooks/stripe` handles key events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `account.updated`
- `transfer.created`
- `transfer.failed`

Webhook handlers persist transaction and account state updates in Supabase.

## 8. Key Product Flows
### 8.1 Auth and onboarding flow
- Sign-up allows role selection: requester or contributor.
- OAuth callback may assign role from callback query.
- Role-based redirect to `/requester`, `/contributor`, `/admin`.

### 8.2 Dataset request lifecycle
1. Requester creates dataset request.
2. New request defaults to `approval_status=pending` and `status=paused`.
3. Admin approves/rejects request.
4. Requester funds dataset.
5. Dataset becomes active when approval + funding conditions are met.
6. Contributors submit files.
7. Requester/admin reviews submissions.
8. Approved outputs can be exported.

### 8.3 Submission lifecycle
1. Contributor uploads files to DO Spaces.
2. `submissions` row created with `pending` status.
3. Reviewer (requester/admin) approves/rejects/needs changes.
4. Approved submission increments sample progress.
5. Admin approval path may trigger payout to contributor.

### 8.4 Waitlist and collaboration intake
- `/api/waitlist`: saves/updates waitlist entries + confirmation emails.
- `/api/collaborations`: validates partner leads, sends internal notification, and can sync to Resend audience/segment.

## 9. Current Feature Maturity Map
### 9.1 Mature/real backend domains
- Dataset CRUD and browse retrieval.
- Submission CRUD/review primitives.
- Admin moderation + stats/overviews.
- Stripe funding/payout/webhook flows.
- DO Spaces upload/delete API.
- Waitlist + collaboration lead capture (Resend).

### 9.2 Partial or placeholder-heavy domains
`lib/actions/requester-actions.ts` is mostly scaffolding and returns defaults.
This impacts:
- requester dashboard KPIs,
- requester datasets listing/status updates,
- requester billing data,
- exports orchestration jobs,
- onboarding progress persistence,
- org settings/API key lifecycle,
- support tickets.

Admin placeholders also exist:
- `getAdminActivityLog`
- `getWaitlistEntries`
- `updateWaitlistStatus`

Additional UI areas contain mock analytics or placeholder cards.

### 9.3 Technical drift to watch
- DB migrations are ahead of some TypeScript action/type contracts.
- Legacy references to removed/changed wallet behavior coexist with active wallet table usage.
- Some links/routes in UI point to pages not implemented in this repo (`/docs`, `/about`, `/legal/*`, etc.).

## 10. Internationalization and Localization
- Supported locales: `en`, `es`.
- Locale cookie: `NEXT_LOCALE`.
- Middleware locale detection uses:
  - country headers,
  - accept-language,
  - IP geolocation fallback (self-hosting context like Dokploy).
- Spain (`ES`) is treated as strong signal for Spanish locale.

## 11. Environment Variables (Categories)
Core env groups used by app:
- Supabase: URL, anon key, service role key, JWT secret.
- Stripe: publishable key, secret key, webhook secret.
- Resend: API key, sender emails, audience/segment IDs, notification targets.
- DO Spaces: access key, secret, endpoint, region, bucket, public CDN URL.
- Routing/deploy: app/marketing hostnames, public app URL, landing mode.
- Optional: platform fee percentage, Stripe test business URL.

Agents must never expose or commit secret values.

## 12. Agent Tooling and Access Model
Agents working on Caudals can assume access to:
- Canonical project tracker: `agents-context/project-tracker.md`.
- Supabase DB via self-hosted VPS (`root@161.35.200.8`) and, when available, Supabase MCP.
- DigitalOcean object storage paths and URLs required for file flow debugging.
- Browser/devtools to validate UI and runtime behavior.
- Repo source code and migration history.

When interacting with production-like resources, agents must prefer read-first validation and minimal-risk mutations.

## 13. Mandatory Skill Usage for UI Work
For frontend/UI/UX tasks, agents should use the local `frontend-design` skill.

Intent:
- Keep UI quality high and consistent with Caudals design direction.
- Avoid generic low-fidelity SaaS output.
- Respect existing design contracts in `design-system.md`.

## 14. Autonomous Execution Protocol for AI Agents
When implementing any non-trivial change, follow this sequence:

1. Discover
- Read this document + relevant local docs (`design-system.md` and domain files).
- Trace route -> component -> action -> DB paths.
- Verify if target area is real logic vs placeholder.

2. Plan
- Define scope and expected behavior changes.
- Identify migration or policy implications.
- Prefer incremental PR-sized changes over broad rewrites.

3. Implement
- Use existing patterns (`lib/actions/*`, role guards, revalidation, typed payloads).
- Preserve role fences and ownership checks.
- Keep storage/payment side-effects idempotent when possible.
- Use MCP servers (e.g. Supabase, browser, etc.) and skills (e.g. frontend-design) when needed

1. Validate
- Run typecheck/lint/tests where available.
- Manually exercise affected flows in browser.
- Validate DB impact (tables, statuses, ledger side-effects).

1. Document
- Update docs when behavior contracts change.
- Add migration notes for schema changes.

## 15. Recommended Autonomous Roadmap (Highest ROI)
1. Implement `requester-actions.ts` against real DB tables introduced by migration `020_requester_overhaul.sql`.
2. Replace admin placeholder actions (`activity/waitlist`) with real queries and writes.
3. Unify wallet/ledger state contracts and remove stale wallet-action assumptions.
4. Add integration tests for critical payment + moderation + requester flows.
5. Add robust export job orchestration using `dataset_exports` table instead of only legacy ad-hoc export helpers.
6. Improve notification center/command palette wiring (currently TODO/mocks).
7. Resolve broken/placeholder public route links or implement missing pages.

## 16. Guardrails and Non-Negotiables
- Do not break role isolation (`requester`, `contributor`, `admin`).
- Do not bypass payment/webhook consistency rules.
- Do not leak secrets or hardcode credentials.
- Do not assume placeholder actions are production-safe.
- Keep dataset lifecycle semantics coherent across approvals, funding, and payouts.

## 17. Repo Reality Check Notes
- This repo currently contains both mature production logic and active scaffolding.
- Agents should treat “implemented” and “designed but stubbed” as separate states and plan accordingly.

---

If you are an autonomous agent starting work now:
- Read this file first.
- Then inspect the exact files in your target flow.
- Prefer small, validated increments with explicit behavior checks.
