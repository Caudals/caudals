# Caudals Architecture

## System Overview
Caudals is a multi-surface product for AI dataset operations:
- Public marketing/discovery (`/`, `/contact`, `/blog`)
- Authentication (`/auth/*`)
- Role applications (`/requester/*`, `/contributor/*`, `/admin/*`)
- Mobile-first contributor companion (`/pwa/*`, out of scope for major redesign)

## Canonical Role Model
- `requester`: dataset brief creation, funding, review, export, org/billing/support management.
- `contributor`: opportunity discovery, uploads/submissions, feedback loops, payout setup/tracking.
- `admin`: moderation, risk/operations triage, payout oversight, platform controls.

Role enforcement is handled through middleware and server-side route guards.

## Application Stack
- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, custom primitives, shadcn/ui
- Data/Auth: Supabase (Postgres + Auth + RLS)
- Payments: Stripe + Stripe Connect
- Storage: DigitalOcean Spaces (S3-compatible)
- Email: Resend
- CI/CD: GitHub Actions -> Docker Hub -> Dokploy on DigitalOcean VPS

## Code Topology
- `app/(home)/*`: marketing/public routes
- `app/(auth)/*`: sign-in/up/callback/reset flows
- `app/(app)/*`: authenticated role apps and APIs
- `components/*`: shared and domain UI modules
- `lib/actions/*`: server action business logic
- `lib/supabase/*`: client/session/admin access wrappers
- `supabase/migrations/*`: schema history and policies

## Runtime Routing and Hostname Behavior
- App hostnames: `NEXT_PUBLIC_APP_HOSTNAMES`
- Marketing hostnames: `NEXT_PUBLIC_MARKETING_HOSTNAMES`
- `/dashboard` is a role-aware entrypoint, not the canonical requester workspace.
- `/dashboard/*` subroutes are deprecated and redirected back to `/dashboard` entrypoint behavior.
- Legacy requester workspace routes under `/dashboard/*` are deprecated.
- Canonical requester IA is `/requester/*`.
- When `LANDING_MODE=true`, the public allowlist is reduced to `/`, `/contact`, `/blog`, `/blog/*`, explicit public APIs, and required metadata/assets. All other routes return `404`.

## Infrastructure and Deployment
- Production runtime is self-hosted on DigitalOcean VPS.
- Dokploy manages runtime/deployment.
- Docker image builds happen in GitHub Actions (`.github/workflows/deploy.yml`) and publish to Docker Hub.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## Self-Hosted Supabase Runtime (Authoritative)
Internal operations context (do not expose outside trusted internal docs):
- VPS SSH endpoint: `root@161.35.200.8`
- Supabase stack path on host: `/supabase/supabase/docker`
- Core containers observed: `supabase-db`, `supabase-kong`, `supabase-rest`, `supabase-auth`, `supabase-storage`, `supabase-studio`, `supabase-pooler`
- Common exposed ports:
  - Studio: `3001`
  - Kong gateway: `8000` (`8443` TLS)
  - Supavisor/pooler: `5432`, `6543`

Use `docs/TOOLS.md` for approved tunnel/CLI/MCP workflows.

## Data and Storage Domains
Core entities:
- `profiles`, `dataset_requests`, `submissions`

Requester/operations entities:
- `dataset_templates`, `dataset_activity`, `dataset_exports`
- `requester_onboarding_progress`, `requester_org_settings`, `requester_api_keys`
- `support_tickets`, `admin_activity_log`, `platform_settings`, `waitlist_signups`

Payments/ledger entities:
- `wallets`, `transactions`, `stripe_accounts`, `stripe_webhook_events`, `payment_compliance_records`

Storage:
- Upload API paths use DigitalOcean Spaces via S3 SDK.
- Public file URL generation uses `NEXT_PUBLIC_DO_SPACES_CDN_URL`.
- Legacy Supabase storage setup artifacts remain for backward compatibility in scripts/migrations.

## Security and Reliability Anchors
- RLS-first access model with scoped service-role usage
- Durable abuse controls on public APIs
- Webhook replay/idempotency protections
- Upload/path validation guardrails
- CI quality gates and validation evidence for release confidence

## Payment Spine
- Requester funding via Stripe PaymentIntents (`wallet-funding` or dataset-specific funding)
- Transaction/ledger persistence with dataset payment status updates
- Contributor payouts through Stripe Connect transfers
- Platform fee handling via configured defaults
- Webhook handlers process `payment_intent.*`, `account.updated`, `transfer.*` events

## Core Lifecycle Flows
1. Requester lifecycle:
   - create request -> admin approval -> fund -> collect submissions -> review -> export
2. Contributor lifecycle:
   - browse opportunities -> submit -> receive feedback -> resubmit (if needed) -> payout progression
3. Admin lifecycle:
   - moderate requests/submissions -> monitor support/risk/payout queues -> resolve incidents
4. Public intake lifecycle:
   - `/api/waitlist` persists/updates lead records and confirmation emails
   - `/api/contact` validates public contact intake and sends internal notifications

## Maturity and Drift Watchlist
Mature backend areas:
- dataset/submission primitives
- moderation baselines
- payment/webhook flows
- upload and intake APIs

Active drift risks:
- schema evolution can outpace TS contracts in some domains
- legacy route/component assumptions can reappear if unchecked
- placeholder or mock-heavy UX can regress operational trust if promoted without validation

## Linked References
- `docs/PLAN.md`
- `docs/generated/db-schema.md`
- `docs/product-specs/platform-overview.md`
- `docs/product-specs/role-workflows.md`
- `docs/TOOLS.md`
