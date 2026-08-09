# Caudals Architecture

## System Overview

Caudals is a B2B AI dataset marketplace and managed data operations platform. The public product promise is simple: companies bring proprietary or difficult-to-source data, companies buy AI-ready datasets, and Caudals performs the operational work in between.

Current production scope is deliberately limited:

- Public marketing, authority, and demand capture: `/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, `/equipo`, `/equipo/*`, `/legal/*`
- Public APIs required by that funnel: `/api/contact`, `/api/waitlist`, `/api/analytics/track`
- Private operator access: `/auth/*`, `/api/auth/*`, and `/admin`
- Direct-route buyer access: `/buyer` for read-only delivery, subscription,
  integration, billing, scorecard, and manifest review
- Direct-route supplier access: `/supplier` for managed asset declaration, signed
  sample upload, build participation, revenue-share payout, and Stripe Connect
  status review
- Direct-route API and security surfaces: `/v1/*` and `/security` when protected
  by their normal route, auth, RLS, rate-limit, and audit controls

Future marketplace scope:

- Supplier company intake for raw data sources and licensing metadata
- Buyer company intake for dataset requirements and purchase interest
- Caudals-operated pipelines for preprocessing, cleaning, PII handling, curation, labeling, packaging, and quality scoring
- Marketplace catalog listings for reviewed datasets

While `LANDING_MODE=true`, buyer, supplier, API, and security routes remain
published and accessible by direct URL. Landing mode only removes public
discovery from the landing page and marketing navigation: no buttons, nav
links, hero CTAs, cards, sitemap promotion, or other public entry points should
lead users to `/buyer`, `/supplier`, `/v1/*`, or `/security` unless explicitly
requested. Catalogue datasets and marketplace browsing are not part of the
current blueprint implementation and remain blocked or unimplemented until a
future catalogue goal.

## Application Stack

- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, custom primitives, shadcn/ui
- Data/Auth target: self-hosted PostgreSQL + Better Auth + Postgres RLS
- Payments: Stripe is present in the codebase but not part of the current public deployment
- Storage: DigitalOcean Spaces (S3-compatible) for raw samples, canonical
  package objects, signed uploads, and licensed delivery artifacts
- Email: Resend
- Observability: Sentry for Next.js error capture, OpenTelemetry OTLP traces to
  private Tempo, Docker logs to Loki through Promtail, and Prometheus metrics
  for the private observability services and container runtime
- Orchestration services: private Dagster runtime with webserver, daemon, and
  code-server containers for dataset software-defined assets
- Workflow services: private Temporal runtime and UI for durable supplier,
  labeling, approval, and long-running operator workflows
- Labeling services: private Label Studio runtime backed by PostgreSQL for
  reviewer projects, annotation work, and exports
- Vector services: private Qdrant runtime for build-time embeddings,
  duplicate discovery, similarity search, and retrieval-heavy QA workflows
- Cache/queue services: private Redis runtime for low-latency cache entries,
  BullMQ-style queue streams, retries, and worker coordination
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
- In landing mode, the public page surface stays narrow
  (`/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`,
  `/newsletter/*`, `/equipo`, `/equipo/*`, `/legal/*`), but `/auth/*`, `/api/auth/*`,
  `/api/user/role`, `/admin`, `/buyer`, `/supplier`, `/security`, `/v1/*`,
  explicit public APIs, and required metadata/assets may remain route-accessible
  according to their normal auth and authorization model.
- Outside landing mode, Phase 1 returns `404` for all removed pre-pivot self-serve route groups.
- `/browse` is removed and blocked during Phase 1; public navigation and sitemap output no longer expose a marketplace browse surface.
- `/contributor` is removed and blocked during Phase 1; contributor self-service will be redesigned after operator workflows are load-bearing.
- `/dashboard` is removed and blocked during Phase 1; app-host root requests are routed to `/admin`.
- `/pwa` is removed and blocked during Phase 1; the manifest no longer links to private companion routes.
- `/requester` is removed and blocked during Phase 1; buyer/requester self-service will be redesigned after operator workflows are load-bearing.
- `/catalogue` and catalogue dataset browsing are future catalogue-goal work and
  are not required for the current blueprint implementation.
- `/security` is the security-review surface. It summarizes implemented
  controls, flags credential-gated readiness items, and routes DPA or
  questionnaire follow-up to `/contact`; production `LANDING_MODE` keeps it
  unlinked from the landing page but does not block direct route access.
- Public buyer brief intake now runs through `/contact`: buyer-focused submissions create `contact`, `buyer_opportunity`, and `dataset_brief` rows under the Caudals tenant, emit `audit_event` state-transition records, and then send the existing operator notification email.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (`@calcom/embed-react`) and is treated as demand capture alongside `/contact`. The booking link is read server-side from the `CALCOM_LINK` env var (with a `NEXT_PUBLIC_CALCOM_LINK` build-time fallback); the inline embed needs only the public Cal link, no API key or OAuth. `/call` stays out of the primary landing navigation but is allowlisted in landing mode and cross-linked from `/contact`.
- `/equipo` and `/equipo/*` are public founder/author authority pages. They may link to an approved, redacted university credential PDF when the corresponding file exists under `public/material/`; missing credentials must not produce broken links or unsupported structured-data claims.
- `/sitemap.xml` is the public sitemap index and points to post, page, and author subsitemaps. `/llms.txt` is the curated public AI-readable index. Neither surface may expose private routes, authenticated workspaces, unpublished catalogue URLs, or operational APIs.
- `/v1/*` is the REST surface. `/v1` returns inline endpoint documentation;
  public brief intake is anonymous and rate-limited, while buyer delivery,
  subscription, and quote actions require a Better Auth buyer session and emit
  audited state transitions. Catalogue dataset endpoints under `/v1/datasets/*`
  are default-404 until a future catalogue rollout explicitly sets
  `PUBLIC_REST_CATALOGUE_ENABLED=true`. Production `LANDING_MODE` keeps `/v1`
  unlinked from the landing page but does not block direct route access.
- §07 acquisition tooling is executable through `npm run caudals -- intake
channels` and `npm run caudals -- intake validate <manifest.json>`. The
  channel registry covers object-storage shares, database snapshots, API
  connectors, warehouse shares, public scrapers, SFTP drops, signed uploads,
  email-to-bucket, physical media, and supplier webhooks; validation fails
  closed into quarantine when the immutable bronze intake contract is missing
  required evidence.
- `/buyer` is the new B2B buyer workspace entrypoint. It is authenticated,
  read-only, and limited to delivery, subscription, integration, billing,
  scorecard, manifest, and trust evidence.
- `/supplier` is the new B2B supplier portal entrypoint. It is authenticated
  and limited to supplier-owned asset declarations, signed sample uploads,
  build participation status, revenue-share payout visibility, and Stripe
  Connect account status.
- Legacy admin subroutes under `/admin/*` have been removed and blocked; `/admin` remains the Operator Console.
- `/api/auth/*` is the Better Auth operator identity endpoint and remains available with `/auth/*` while `LANDING_MODE=true`.
- Buyer, supplier, API, and security route access must not be confused with
  landing-page exposure. These surfaces can be published by direct route while
  remaining absent from landing-page navigation and marketing CTAs.

## Infrastructure and Deployment

- Production runtime is self-hosted on the Hetzner cost-optimized VPS at
  `168.119.49.95` (`caudals-1`). Cutover from DigitalOcean completed on
  2026-06-30: Cloudflare proxies the production hostnames to Hetzner, where the
  Dokploy Traefik terminates TLS (Let's Encrypt) and routes to the local app,
  Umami, and private stacks on `dokploy-network`.
- The DigitalOcean VPS remains online and untouched as the rollback origin (app
  service `1/1`, verified backups retained under `/root/.caudals/backups`).
  Rollback is a Hetzner-local revert (remove Dokploy Traefik, start HAProxy) and
  needs no Cloudflare/DNS change.
- Dokploy manages runtime/deployment.
- App and orchestration Docker image builds happen in GitHub Actions
  (`.github/workflows/deploy.yml`) and publish immutable tags to Docker Hub.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## PostgreSQL Runtime

Target Phase 1 operations context:

- Target VPS SSH endpoint: `caudals@caudals-1` (Hetzner Tailscale host `100.118.70.90`). Public SSH on `168.119.49.95` is not an operations path.
- PostgreSQL runtime: private `caudals-postgres` swarm service on `dokploy-network`
- Runtime image: `caudals-postgres:16-pgvector-cron`, built from `infra/postgres/Dockerfile`
- App runtime: `caudalsdep-caudals-vgbvxp` on `dokploy-network`, using Docker
  secret-file envs for Postgres, Better Auth, Stripe, Resend, Sentry, and
  object-storage secrets on the Hetzner production service (no plaintext secret
  env names; stale Supabase runtime envs removed)
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
- Migration reports:
  - `docs/migrations/supabase-to-postgres.md`
  - `docs/migrations/digitalocean-to-hetzner-vps-migration.md`
- Public routing contract:
  - PostgreSQL has no public ingress.
  - Application access goes through server-side typed DB clients and operator-scoped RLS settings.
  - Public `22/tcp` is closed in the completed production posture; during the
    Hetzner bootstrap window, temporary key-only public SSH must be removed as
    soon as Tailscale `caudals@caudals-1` access is verified.
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

- Caudals uses an S3-compatible object store for supplier samples, dataset
  files, generated packages, and licensed delivery artifacts. The current
  single-node runtime can deploy a private MinIO service on `dokploy-network`;
  DigitalOcean Spaces remains the external managed-store target for hosted
  production environments.
- The private object-storage stack is defined in
  `infra/object-storage/docker-stack.yml` and runs MinIO without public ingress.
  `scripts/deploy-object-storage-stack.sh` creates root-only generated access
  credentials under `/root/.caudals/object-storage/`, stores them as Docker
  secrets, creates the configured bucket, and wires the app service to
  `DO_SPACES_*_FILE` secret fallbacks.
- The application reads object-storage configuration through direct env vars or
  Docker secret-file fallbacks for `DO_SPACES_ACCESS_KEY_ID_FILE` and
  `DO_SPACES_SECRET_ACCESS_KEY_FILE`; plaintext access-key env vars are blocked
  by the completion gate.
- `scripts/probe-object-storage.ts` validates any externally reachable
  S3-compatible configuration by writing, reading, and deleting a short private
  probe object without printing credentials. `scripts/probe-object-storage-stack.sh`
  performs the same write/read/delete check from inside the private Docker
  network and verifies the stack has no published ports.
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
- The Dagster code location exposes reference assets for the full G-1 through
  G-7 blueprint path: intake, profiling, deterministic cleaning, privacy/PII
  mapping, enrichment, labeling review, and QA/package scorecard.
- Dagster is available only on the private Docker network at
  `http://caudals-orchestration-webserver:3000`; the code server is internal
  at `caudals-orchestration-code:4000`.
- `scripts/probe-orchestration-stack.sh` verifies the webserver `/server_info`
  endpoint, the code-server gRPC healthcheck, execution of the
  `caudals_reference_build` reference job, and Dagster-originated OpenLineage
  ingestion into Marquez.
- The private workflow stack is defined in `infra/workflow/docker-stack.yml`
  and runs Temporal server plus Temporal UI on `dokploy-network` without public
  ingress.
- Temporal stores persistence in dedicated `temporal` and
  `temporal_visibility` PostgreSQL databases owned by the dedicated `temporal`
  role on the private `caudals-postgres` service.
- The Temporal database password is mounted through the external Docker secret
  `temporal_postgres_password`; runtime containers read it from the secret file
  and export it only inside the container process so the repository and Docker
  service spec do not store the secret value.
- Durable workflow RPC is available only on the private Docker network at
  `grpc://caudals-workflow-temporal:7233`; the internal UI is available at
  `http://caudals-workflow-ui:8080`.
- `scripts/probe-workflow-stack.sh` verifies Temporal cluster health, the
  `caudals-operations` namespace, the private UI endpoint, and the absence of
  published ports.
- The private labeling stack is defined in `infra/labeling/docker-stack.yml`
  and runs Label Studio plus a dedicated PostgreSQL database on
  `dokploy-network` without public ingress.
- Label Studio persists reviewer projects, annotations, and exports on a
  dedicated Docker volume and uses PostgreSQL instead of SQLite for production
  labeling throughput.
- The Label Studio PostgreSQL password and Django `SECRET_KEY` are mounted
  through external Docker secrets; runtime containers read the values from
  secret files so the repository and Docker service spec do not store them.
- Label Studio is available only on the private Docker network at
  `http://caudals-labeling-label-studio:8080`.
- `scripts/probe-labeling-stack.sh` verifies the private Label Studio HTTP
  endpoint, PostgreSQL migrations, and the absence of published ports.
- The private vector stack is defined in `infra/vector/docker-stack.yml` and
  runs Qdrant on `dokploy-network` without public ingress.
- Qdrant stores build-time vectors on a dedicated Docker volume and reads its
  API key from the external Docker secret `qdrant_api_key`; the repository and
  Docker service spec do not store the secret value.
- Qdrant HTTP is available only on the private Docker network at
  `http://caudals-vector-qdrant:6333`; gRPC is available internally at
  `grpc://caudals-vector-qdrant:6334`.
- `scripts/probe-vector-stack.sh` verifies authenticated Qdrant reachability,
  creates or updates a probe collection, writes and reads a vector point, and
  verifies the absence of published ports.
- The private cache stack is defined in `infra/cache/docker-stack.yml` and runs
  Redis on `dokploy-network` without public ingress.
- Redis stores append-only queue/cache state on a dedicated Docker volume and
  reads its password from the external Docker secret `redis_password`; the
  repository and Docker service spec do not store the secret value.
- Redis is available only on the private Docker network at
  `redis://caudals-cache-redis:6379`.
- `scripts/probe-cache-stack.sh` verifies authenticated Redis reachability,
  cache key read/write, queue stream append/readiness, and the absence of
  published ports.
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
- content: bundled blog fallback and marketing metadata; newly approved blog
  posts are read from the narrow public Leads archive API with 60-second
  server-side revalidation, so publication does not rebuild this application
- operations: private admin activity, platform settings, audit notes

Future marketplace data domains:

- organizations: supplier companies, buyer companies, contacts, contracts
- supplier assets: raw data source metadata, rights, consent, provenance, schema profiles
- dataset build operations: ingestion jobs, cleaning runs, labeling batches, QA reports, acceptance criteria
- future catalogue: listing metadata, previews, schemas, quality scores,
  pricing, delivery artifacts once the separate catalogue goal starts
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
- landing-mode landing-page/navigation restriction
- public intake APIs
- private infrastructure access hardening

Active drift risks:

- direct-route buyer/supplier/API/security surfaces must stay protected by auth,
  authorization, RLS, rate limits, and audit rather than relying on landing-page
  obscurity
- marketplace relaunch requires a schema and IA rebuild, not small copy edits on
  direct-route workspace surfaces
- public SEO metadata and blog content must stay aligned with B2B dataset operations

## Linked References

- `product-specs/overview.md`
- `TOOLS.md`
- [Caudals Leads architecture](https://github.com/Caudals/leads/blob/main/docs/ARCHITECTURE.md) — the
  separate Leads CRM runtime, which shares private `caudals-postgres` and
  `dokploy-network` conventions but owns its dedicated `caudals_leads` database
  and application schema.
