# Caudals Architecture

## System Overview
Caudals is a B2B AI dataset marketplace and managed data operations platform. The public product promise is simple: companies bring proprietary or difficult-to-source data, companies buy AI-ready datasets, and Caudals performs the operational work in between.

Current production scope is deliberately limited:
- Public marketing and demand capture: `/`, `/contact`, `/blog`, `/blog/*`
- Public APIs required by that funnel: `/api/contact`, `/api/waitlist`, `/api/analytics/track`
- Internal admin dashboard and operational tooling, kept private

Future marketplace scope:
- Supplier company intake for raw data sources and licensing metadata
- Buyer company intake for dataset requirements and purchase interest
- Caudals-operated pipelines for preprocessing, cleaning, PII handling, curation, labeling, packaging, and quality scoring
- Marketplace catalog listings for reviewed datasets

Former individual sample-upload workflows are legacy implementation artifacts. Do not extend them. While `LANDING_MODE=true`, non-public marketplace and app routes must remain unavailable from the public web.

## Application Stack
- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, custom primitives, shadcn/ui
- Data/Auth: Supabase (Postgres + Auth + RLS)
- Payments: Stripe is present in the codebase but not part of the current public deployment
- Storage: DigitalOcean Spaces (S3-compatible)
- Email: Resend
- CI/CD: GitHub Actions -> Docker Hub -> Dokploy on DigitalOcean VPS

## Code Topology
- `app/(home)/*`: marketing/public routes
- `app/(auth)/*`: sign-in/up/callback/reset flows
- `app/(app)/*`: legacy authenticated app, admin dashboard, and APIs
- `components/*`: shared and domain UI modules
- `lib/actions/*`: server action business logic
- `lib/supabase/*`: client/session/admin access wrappers
- `supabase/migrations/*`: schema history and policies

## Runtime Routing and Hostname Behavior
- App hostnames: `NEXT_PUBLIC_APP_HOSTNAMES`
- Marketing hostnames: `NEXT_PUBLIC_MARKETING_HOSTNAMES`
- `LANDING_MODE=true` is the current public deployment posture.
- In landing mode, the public allowlist is `/`, `/contact`, `/blog`, `/blog/*`, explicit public APIs, and required metadata/assets. All other routes return `404`.
- Legacy app routes must not be treated as canonical product behavior until the marketplace is rebuilt around B2B buyers, suppliers, and internal operators.

## Infrastructure and Deployment
- Production runtime is self-hosted on DigitalOcean VPS.
- Dokploy manages runtime/deployment.
- Docker image builds happen in GitHub Actions (`.github/workflows/deploy.yml`) and publish to Docker Hub.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## Self-Hosted Supabase Runtime (Authoritative)
Internal operations context (do not expose outside trusted internal docs):
- VPS SSH endpoint over Tailscale: `root@ubuntu-caudals`
- Supabase stack path on host: `/supabase/supabase/docker`
- Core containers observed: `supabase-db`, `supabase-kong`, `supabase-rest`, `supabase-auth`, `supabase-storage`, `supabase-studio`, `supabase-pooler`
- Internal-only host ports (bound to localhost after the 2026-04-03 hardening pass):
  - Studio: `3001`
  - Kong gateway: `8000` (`8443` TLS)
  - Supavisor/pooler: `5432`, `6543`
- Public routing contract after the 2026-04-03 hardening pass:
  - `https://supabase.caudals.com/` no longer exposes Studio.
  - Public traffic is limited to the required Supabase API path prefixes routed through Traefik to Kong.
  - Public `22/tcp` is closed; SSH administration is restricted to the Tailscale interface.
  - Raw host ports for Studio, Kong, analytics, and pooler are not intended to be reachable from the public internet.

Use `docs/TOOLS.md` for approved tunnel/CLI/MCP workflows.

## Data and Storage Domains
Current live data domains:
- lead capture: contact and waitlist records
- content: blog posts and marketing metadata
- operations: private admin activity, platform settings, audit notes

Future marketplace data domains:
- organizations: supplier companies, buyer companies, contacts, contracts
- supplier assets: raw data source metadata, rights, consent, provenance, schema profiles
- dataset build operations: ingestion jobs, cleaning runs, labeling batches, QA reports, acceptance criteria
- catalog: listing metadata, samples, schemas, quality scores, pricing, delivery artifacts
- commercial operations: buyer inquiries, quotes, subscriptions/licenses, invoices, supplier revenue share

Legacy tables from the previous product are documented in `docs/generated/db-schema.md`. Do not add new behavior to those tables unless the task is explicitly a migration/deprecation step.

## Security and Reliability Anchors
- RLS-first access model with scoped service-role usage
- Durable abuse controls on public APIs
- Webhook replay/idempotency protections when payment code is active
- Upload/path validation guardrails
- Dataset rights, provenance, PII handling, and licensing auditability
- CI quality gates and validation evidence for release confidence

## Core Lifecycle Flows
1. Public demand capture:
   - visitor reads landing/blog -> submits contact or waitlist -> internal team qualifies the opportunity.
2. Supplier data monetization:
   - company offers data -> Caudals validates rights and feasibility -> Caudals ingests/processes/curates -> dataset is listed or matched privately.
3. Buyer dataset acquisition:
   - company describes dataset need -> Caudals finds or builds dataset -> buyer reviews sample/QA report -> license and delivery complete.
4. Internal operations:
   - Caudals tracks leads, supplier assets, build status, QA, compliance, pricing, and delivery from a private admin dashboard.

## Maturity and Drift Watchlist
Mature current areas:
- landing/contact/blog public surface
- landing-mode route restriction
- public intake APIs
- private infrastructure access hardening

Active drift risks:
- legacy app, schema, copy, tests, and payments still reflect the retired product model
- marketplace relaunch requires a schema and IA rebuild, not small copy edits on old routes
- public SEO metadata and blog content must stay aligned with B2B dataset operations

## Linked References
- `docs/PLAN.md`
- `docs/generated/db-schema.md`
- `docs/product-specs/platform-overview.md`
- `docs/product-specs/marketplace-operations.md`
- `docs/product-specs/service-tiers.md`
- `docs/TOOLS.md`
