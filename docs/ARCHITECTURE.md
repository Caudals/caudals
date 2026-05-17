# Caudals Architecture

## System Overview
Caudals is a B2B AI dataset marketplace and managed data operations platform. The public product promise is simple: companies bring proprietary or difficult-to-source data, companies buy AI-ready datasets, and Caudals performs the operational work in between.

Current production scope is deliberately limited:
- Public marketing and demand capture: `/`, `/contact`, `/blog`, `/blog/*`
- Public APIs required by that funnel: `/api/contact`, `/api/waitlist`, `/api/analytics/track`
- Private operator access: `/auth/*`, `/api/auth/*`, and `/admin`
- Hidden buyer access: `/buyer` for read-only delivery, subscription,
  integration, billing, scorecard, and manifest review
- Hidden supplier access: `/supplier` for managed asset declaration, signed
  sample upload, build participation, revenue-share payout, and Stripe Connect
  status review

Future marketplace scope:
- Supplier company intake for raw data sources and licensing metadata
- Buyer company intake for dataset requirements and purchase interest
- Caudals-operated pipelines for preprocessing, cleaning, PII handling, curation, labeling, packaging, and quality scoring
- Marketplace catalog listings for reviewed datasets

While `LANDING_MODE=true`, marketplace and app routes must remain unavailable
except the private operator auth/admin surface. `/catalogue`, `/security`,
`/v1/*`, `/buyer`, and `/supplier` are implemented for non-landing or
authenticated review but stay hidden in production until explicit clearance.

## Application Stack
- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, custom primitives, shadcn/ui
- Data/Auth target: self-hosted PostgreSQL + Better Auth + Postgres RLS
- Payments: Stripe is present in the codebase but not part of the current public deployment
- Storage: DigitalOcean Spaces (S3-compatible)
- Email: Resend
- Observability: Sentry for Next.js error capture, OpenTelemetry OTLP traces to
  private Tempo, Docker logs to Loki through Promtail, and Prometheus metrics
  for the private observability services and container runtime
- Orchestration services: private Dagster runtime with webserver, daemon, and
  code-server containers for dataset software-defined assets
- Operations services: private Marquez/OpenLineage runtime for dataset build
  lineage ingestion and readback
- CI/CD: GitHub Actions -> Docker Hub -> Dokploy on DigitalOcean VPS

## Code Topology
- `app/(home)/*`: marketing/public routes
- `app/(auth)/*`: sign-in/callback/reset flows for existing internal accounts
- `app/(app)/*`: hidden authenticated app, admin dashboard, and APIs
- `app/(buyer)/*`: relaunched B2B buyer workspace routes; currently `/buyer`
  only, read-only, and focused on deliveries, subscriptions, integrations,
  billing, scorecards, manifests, and trust evidence
- `app/(supplier)/*`: relaunched supplier portal routes; currently `/supplier`
  only, limited to managed onboarding, asset declaration, sample upload, build
  progress, revenue-share payout, and Stripe Connect status review
- `app/(app)/api/auth/[...all]`: Better Auth endpoint for operator email/password,
  reset-password, organization/team, and optional TOTP/passkey hardening
- `components/*`: shared and domain UI modules
- `lib/actions/*`: server action business logic
- `lib/operator/*`: operator-console domain workflows, license composition, and snapshot fixtures
- `modality_contract` records cover video, audio, geospatial, document, and
  time-series build contracts; document uses page-level Parquet plus source
  references, while time-series uses event-time/entity partitioned Parquet.
- `release_documentation_bundle` records store G-7 package evidence for each
  released dataset version: required docs, Croissant JSON-LD, Article 10 data
  governance notes, validation status, and public HF mirror metadata.
- `compliance_control_scope` records store SOC 2 / ISO 27001 control scope,
  framework mappings, owner, evidence links, review cadence, and readiness state
  for operator-managed governance review.
- `security_review_artifact` records store published public questionnaire
  answers, DPA review-path notes, and evidence-packet items that back the M3
  `/security` page.
- Build cost envelopes are enforced from append-only `cost_entry` rows: spend
  rolls into build totals, 80% thresholds open alerts, hard budget and LLM/API
  sub-budget overruns require an explicit override reason, and >15% overruns
  flag margin retrospectives.
- `runbook` and `escalation_case` records back the section 24 top-level
  Escalations operator view. New cases auto-map to canonical R-01..R-13
  runbooks, including security-specific R-11..R-13, route to the owning
  on-call queue, open an alert, and emit audit evidence.
- `db/migrations/*`: target self-hosted PostgreSQL schema history
- `db/rollbacks/*`: rollback SQL for new PostgreSQL migrations

## Runtime Routing and Hostname Behavior
- App hostnames: `NEXT_PUBLIC_APP_HOSTNAMES`
- Marketing hostnames: `NEXT_PUBLIC_MARKETING_HOSTNAMES`
- `LANDING_MODE=true` is the current public deployment posture.
- In landing mode, the allowlist is `/`, `/contact`, `/blog`, `/blog/*`,
  explicit public APIs, `/auth/*`, `/api/auth/*`, `/api/user/role`, `/admin`,
  and required metadata/assets. All other routes return `404`.
- Outside landing mode, Phase 1 returns `404` for all removed pre-pivot self-serve route groups.
- `/browse` is removed and blocked during Phase 1; public navigation and sitemap output no longer expose a marketplace browse surface.
- `/contributor` is removed and blocked during Phase 1; contributor self-service will be redesigned after operator workflows are load-bearing.
- `/dashboard` is removed and blocked during Phase 1; app-host root requests are routed to `/admin`.
- `/pwa` is removed and blocked during Phase 1; the manifest no longer links to private companion routes.
- `/requester` is removed and blocked during Phase 1; buyer/requester self-service will be redesigned after operator workflows are load-bearing.
- `/catalogue` is the M3 curated dataset listing surface. It is read-only, uses only active public `catalogue_listing` rows, and routes access requests to `/contact`; production `LANDING_MODE` keeps it hidden until explicit clearance.
- `/security` is the M3 security-review surface. It summarizes implemented controls, flags credential-gated readiness items, and routes DPA or questionnaire follow-up to `/contact`; production `LANDING_MODE` keeps it hidden until explicit clearance.
- Public buyer brief intake now runs through `/contact`: buyer-focused submissions create `contact`, `buyer_opportunity`, and `dataset_brief` rows under the Caudals tenant, emit `audit_event` state-transition records, and then send the existing operator notification email.
- `/v1/*` is the M3 REST surface. `/v1` returns inline endpoint documentation; public catalogue/intake routes are anonymous and rate-limited, while buyer delivery, subscription, and quote actions require a Better Auth buyer session and emit audited state transitions. Production `LANDING_MODE` keeps the surface hidden until explicit clearance.
- `/buyer` is the new B2B buyer workspace entrypoint. It is authenticated,
  read-only, and limited to delivery, subscription, integration, billing,
  scorecard, manifest, and trust evidence.
- `/supplier` is the new B2B supplier portal entrypoint. It is authenticated
  and limited to supplier-owned asset declarations, signed sample uploads,
  build participation status, revenue-share payout visibility, and Stripe
  Connect account status.
- Legacy admin subroutes under `/admin/*` have been removed and blocked; `/admin` remains the Operator Console.
- `/api/auth/*` is the Better Auth operator identity endpoint and remains available with `/auth/*` while `LANDING_MODE=true`.
- Hidden app routes must not be treated as canonical production behavior until
  the marketplace is rebuilt around B2B buyers, suppliers, and internal
  operators.

## Infrastructure and Deployment
- Production runtime is self-hosted on DigitalOcean VPS.
- Dokploy manages runtime/deployment.
- Docker image builds happen in GitHub Actions (`.github/workflows/deploy.yml`) and publish to Docker Hub.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## PostgreSQL Runtime
Target Phase 1 operations context:
- VPS SSH endpoint over Tailscale: `root@ubuntu-caudals`
- PostgreSQL runtime: private `caudals-postgres` swarm service on `dokploy-network`
- Runtime image: `caudals-postgres:16-pgvector-cron`, built from `infra/postgres/Dockerfile`
- App runtime: `caudalsdep-caudals-vgbvxp` on `dokploy-network`, using Docker secret-file envs for Postgres and Better Auth secrets
- Required extensions: `pgcrypto`, `citext`, `pg_stat_statements`, `vector`, `pg_trgm`, `pg_cron`
- Migration files: `db/migrations/*`
- Rollback files: `db/rollbacks/*`
- Better Auth identity tables use `auth_*` names so they do not collide with operator-domain tables.
- Production operator login allows password-only Better Auth sessions by
  policy. TOTP and passkeys remain available as optional hardening, while JIT
  elevation and Postgres RLS remain the load-bearing admin controls.
- Vulnerability management runs through weekly Dependabot checks for npm,
  GitHub Actions, and Dockerfile base images plus Docker Scout image scans in
  the Docker publish workflow. A quarterly scheduled GitHub workflow opens or
  updates the penetration-test tracker issue for Security/CTO execution.
- Migration report: `docs/migrations/supabase-to-postgres.md`
- Public routing contract:
  - PostgreSQL has no public ingress.
  - Application access goes through server-side typed DB clients and operator-scoped RLS settings.
  - Public `22/tcp` is closed; SSH administration is restricted to the Tailscale interface.
  - Raw database ports are not intended to be reachable from the public internet.

Legacy Supabase containers, images, volumes, and host filesystem tree were removed after verified encrypted backups were written under `/root/.caudals/backups`.

Use `docs/TOOLS.md` for approved tunnel/CLI/MCP workflows.

## Observability
- Sentry initialization is registered through Next.js instrumentation for server,
  edge, and client runtime errors.
- Sentry is disabled until `SENTRY_DSN` or the server-only
  `SENTRY_DSN_FILE` Docker secret fallback is configured. Default sampling is
  `0` for traces/profiles unless environment variables raise it.
- The private Docker Swarm observability stack is defined in
  `infra/observability/docker-stack.yml` and runs on `dokploy-network` without
  public ingress.
- OpenTelemetry spans emitted by the app export over OTLP HTTP when
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. The production target is
  `http://caudals-observability-tempo:4318/v1/traces`.
- Docker runtime logs are scraped through Promtail and written to Loki with
  `service_name`, `container_name`, `container_id`, `stack`, and `stream`
  labels.
- Prometheus scrapes Alertmanager, Tempo, Loki, Promtail, cAdvisor, and itself
  for platform metrics and evaluates private Alertmanager-routed rules for
  scrape failures, host disk pressure, and rule/config health. Grafana is
  provisioned internally with Prometheus, Loki, and Tempo datasources.
- OpenTelemetry stdout export remains opt-in via `OTEL_STDOUT_ENABLED=true`
  for bounded diagnostics; it should not be enabled permanently if logs may
  contain sensitive operational context.

## Operations Services
- The private orchestration stack is defined in
  `infra/orchestration/docker-stack.yml` and runs Dagster on
  `dokploy-network` without public ingress.
- Dagster stores run, event-log, and schedule metadata in a dedicated
  `dagster` PostgreSQL database owned by the dedicated `dagster` role on the
  private `caudals-postgres` service.
- The Dagster database password is mounted through the external Docker secret
  `dagster_postgres_password`; runtime containers read it through
  `DAGSTER_POSTGRES_PASSWORD_FILE` so the repository and Docker service spec do
  not store the secret value.
- The initial code location exposes three reference assets,
  `bronze_intake_sample`, `silver_profile_report`, and `gold_qa_scorecard`,
  matching the blueprint's G-1 intake, G-2 profiling, and G-7 QA stages.
- Dagster is available only on the private Docker network at
  `http://caudals-orchestration-webserver:3000`; the code server is internal
  at `caudals-orchestration-code:4000`.
- `scripts/probe-orchestration-stack.sh` verifies the webserver `/server_info`
  endpoint, the code-server gRPC healthcheck, execution of the
  `caudals_reference_build` reference job, and Dagster-originated OpenLineage
  ingestion into Marquez.
- The private operations service stack is defined in
  `infra/operations/docker-stack.yml` and runs on `dokploy-network` without
  public ingress.
- Marquez stores OpenLineage events in a dedicated `marquez` PostgreSQL
  database owned by the dedicated `marquez` role on the private
  `caudals-postgres` service.
- The Marquez database password is mounted through the external Docker secret
  `marquez_postgres_password`; the runtime config is generated inside the
  container so the repository and Docker service spec do not store the secret
  value.
- OpenLineage ingestion is available only on the private Docker network at
  `http://caudals-operations-marquez:5000/api/v1/lineage`; the admin
  healthcheck is available internally at
  `http://caudals-operations-marquez:5001/healthcheck`.
- `scripts/probe-operations-stack.sh` verifies the admin healthcheck,
  namespaces API, and a synthetic OpenLineage `COMPLETE` event ingest from an
  ephemeral container attached to the private network.

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
- Error capture and opt-in stdout tracing without default PII transmission
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
