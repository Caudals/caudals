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

While `LANDING_MODE=true`, non-public marketplace and app routes must remain unavailable from the public web.

## Application Stack
- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, custom primitives, shadcn/ui
- Data/Auth target: self-hosted PostgreSQL + Better Auth + Postgres RLS
- Payments: Stripe is present in the codebase but not part of the current public deployment
- Storage: DigitalOcean Spaces (S3-compatible)
- Email: Resend
- CI/CD: GitHub Actions -> Docker Hub -> Dokploy on DigitalOcean VPS

## Code Topology
- `app/(home)/*`: marketing/public routes
- `app/(auth)/*`: sign-in/callback/reset flows for existing internal accounts
- `app/(app)/*`: hidden authenticated app, admin dashboard, and APIs
- `app/(app)/api/auth/[...all]`: Better Auth endpoint for operator email/password,
  reset-password, organization/team, TOTP, and passkey flows during the PostgreSQL auth migration
- `components/*`: shared and domain UI modules
- `lib/actions/*`: server action business logic
- `lib/operator/*`: operator-console domain workflows, license composition, and snapshot fixtures
- `db/migrations/*`: target self-hosted PostgreSQL schema history
- `db/rollbacks/*`: rollback SQL for new PostgreSQL migrations

## Runtime Routing and Hostname Behavior
- App hostnames: `NEXT_PUBLIC_APP_HOSTNAMES`
- Marketing hostnames: `NEXT_PUBLIC_MARKETING_HOSTNAMES`
- `LANDING_MODE=true` is the current public deployment posture.
- In landing mode, the public allowlist is `/`, `/contact`, `/blog`, `/blog/*`, explicit public APIs, and required metadata/assets. All other routes return `404`.
- Outside landing mode, Phase 1 returns `404` for all removed pre-pivot self-serve route groups.
- `/browse` is removed and blocked during Phase 1; public navigation and sitemap output no longer expose a marketplace browse surface.
- `/contributor` is removed and blocked during Phase 1; contributor self-service will be redesigned after operator workflows are load-bearing.
- `/dashboard` is removed and blocked during Phase 1; app-host root requests are routed to `/admin`.
- `/pwa` is removed and blocked during Phase 1; the manifest no longer links to private companion routes.
- `/requester` is removed and blocked during Phase 1; buyer/requester self-service will be redesigned after operator workflows are load-bearing.
- Legacy admin subroutes under `/admin/*` have been removed and blocked; `/admin` remains the Operator Console.
- `/api/auth/*` is the Better Auth migration endpoint outside landing mode. It remains unavailable when `LANDING_MODE=true` because only explicit public funnel APIs are allowed.
- Hidden app routes must not be treated as canonical product behavior until the marketplace is rebuilt around B2B buyers, suppliers, and internal operators.

## Infrastructure and Deployment
- Production runtime is self-hosted on DigitalOcean VPS.
- Dokploy manages runtime/deployment.
- Docker image builds happen in GitHub Actions (`.github/workflows/deploy.yml`) and publish to Docker Hub.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## PostgreSQL Runtime
Target Phase 1 operations context:
- VPS SSH endpoint over Tailscale: `root@ubuntu-caudals`
- PostgreSQL runtime target: Dokploy-managed Postgres 16 with `pgcrypto`, `citext`, `pg_stat_statements`, and `vector`
- Migration files: `db/migrations/*`
- Rollback files: `db/rollbacks/*`
- Better Auth identity tables use `auth_*` names so they do not collide with operator-domain tables.
- Legacy migration report: `docs/migrations/supabase-to-postgres.md`
- Public routing contract:
  - PostgreSQL has no public ingress.
  - Application access goes through server-side typed DB clients and operator-scoped RLS settings.
  - Public `22/tcp` is closed; SSH administration is restricted to the Tailscale interface.
  - Raw database ports are not intended to be reachable from the public internet.

Legacy Supabase containers remain live until the migration report records dump, transform, load, sampled diff verification, final encrypted backup, and explicit decommission approval.

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
- catalog: listing metadata, previews, schemas, quality scores, pricing, delivery artifacts
- commercial operations: buyer inquiries, quotes, subscriptions/licenses, invoices, supplier revenue share

## Security and Reliability Anchors
- RLS-first access model with scoped service-role usage
- Durable abuse controls on public APIs
- Webhook replay/idempotency protections when payment code is active
- Upload/path validation guardrails
- Dataset rights, provenance, PII handling, and licensing auditability
- CI quality gates for release confidence

## Core Lifecycle Flows
1. Public demand capture:
   - visitor reads landing/blog -> submits contact or waitlist -> internal team qualifies the opportunity.
2. Supplier data monetization:
   - company offers data -> Caudals validates rights and feasibility -> Caudals ingests/processes/curates -> dataset is listed or matched privately.
3. Buyer dataset acquisition:
   - company describes dataset need -> Caudals finds or builds dataset -> buyer reviews preview/QA report -> license and delivery complete.
4. Internal operations:
   - Caudals tracks leads, supplier assets, build status, QA, compliance, pricing, and delivery from a private admin dashboard.

## Maturity and Drift Watchlist
Mature current areas:
- landing/contact/blog public surface
- landing-mode route restriction
- public intake APIs
- private infrastructure access hardening

Active drift risks:
- hidden app, schema, copy, and payments still reflect pre-pivot assumptions
- marketplace relaunch requires a schema and IA rebuild, not small copy edits on hidden routes
- public SEO metadata and blog content must stay aligned with B2B dataset operations

## Linked References
- `product-specs/overview.md`
- `TOOLS.md`
