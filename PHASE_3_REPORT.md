# Phase 3 Report

## Current Slice Plan

- Continue M3 under the current landing-mode product contract: `/buyer`,
  `/supplier`, `/security`, and `/v1/*` stay directly route-accessible with
  their normal controls, while the landing page, marketing navigation, sitemap,
  robots output, and security-page header avoid public discovery paths to those
  surfaces.
- Keep catalogue datasets, public catalogue browsing, catalogue purchase flows,
  broader buyer/supplier self-service, and payout execution unavailable until a
  future catalogue goal.

## Shipped

- Public buyer brief intake is present in the current branch. The earlier
  `/catalogue` implementation remains blocked from landing-mode production and
  is not a completion requirement under the active catalogue deferral.
- Buyer Workspace v1 adds buyer-scoped quote, invoice, and delivery-integration fields via `db/migrations/018_buyer_workspace_v1.sql` with rollback coverage.
- `/buyer` now loads subscription operations, delivery integrations, and billing rows through RLS-scoped Postgres queries behind `BUYER_WORKSPACE_V1_ENABLED`.
- Supplier Portal v1 adds supplier-scoped payout integration metadata via `db/migrations/019_supplier_payout_workspace.sql` with rollback coverage.
- `/supplier` now loads payout rows and Stripe Connect account status through RLS-scoped Postgres queries behind `SUPPLIER_PORTAL_V1_ENABLED`.
- Document and time-series modality contracts now extend the operator modality model, creation defaults, and fixtures.
- Release documentation bundles now generate and store G-7 package manifests, Croissant JSON-LD, Article 10 documentation, required docs, validation evidence, and public HF mirror metadata.
- Deterministic operator fixtures now include a delivered representative dataset
  build with all G-1 through G-7 gates passing, bronze/silver/gold partitions,
  source/profile/QA/privacy/package/Croissant/lineage artifacts, published
  release documentation, and an accepted buyer delivery receipt.
- SOC 2 / ISO 27001 scoping now has an operator-owned control register with framework mappings, evidence links, review cadence, readiness states, and audited workflow transitions.
- Versioned `/v1/*` REST now exposes inline API documentation, public brief
  intake, and buyer-scoped delivery, quote, and subscription actions behind rate
  limits and Better Auth where required. Catalogue dataset endpoints are
  default-disabled behind the future-catalogue `PUBLIC_REST_CATALOGUE_ENABLED`
  flag.
- Private observability now runs on `dokploy-network` with OpenTelemetry traces to Tempo, Docker logs to Loki through Promtail, Prometheus metrics for Tempo/Loki/Promtail/cAdvisor, and internal Grafana datasources.
- Private operations lineage now runs on `dokploy-network` with Marquez
  receiving OpenLineage events into a dedicated private PostgreSQL
  role/database and no public ingress.
- Production operator auth now allows password-only access by policy; TOTP and passkeys remain optional Better Auth hardening, JIT elevation remains audited, and reset-link request audit paths are retained.
- Vulnerability management now has weekly Dependabot checks for npm, GitHub Actions, and Dockerfile base images, Docker Scout scans on published app images, and a quarterly penetration-test tracker workflow.
- Build cost envelopes now roll append-only cost ledger entries into build totals, alert at 80%, require explicit override reasons above hard build/LLM/API budgets, and flag >15% margin retrospectives.
- Internal escalation runbooks now have canonical R-01..R-13 records, top-level `escalation_case` routing, automatic alert/audit creation, security-specific R-11..R-13 incident paths, and an Operator Console Escalations module.
- Public security review is implemented at `/security` as a direct-route surface
  with buyer-facing control evidence, readiness caveats, and DPA/questionnaire
  follow-up routed to `/contact`; landing mode hides public discovery but no
  longer blocks the route.
- The public security review page is now backed by `security_review_artifact`, an RLS-scoped library of published questionnaire answers, DPA review-path notes, and evidence packet items.
- Added a VPS-side platform completion gate, `npm run platform:completion-status`, that aggregates the final production checks for landing-mode routing, exact public nav labels, Sentry, operator auth policy, private observability readiness, private operations lineage readiness, external alert routing, tracked Sentry auth-token leaks, and the current-quarter pentest tracker.
- Alertmanager deployment now supports rendering a private external webhook receiver from `CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE` or `CAUDALS_ALERTMANAGER_WEBHOOK_URL` without committing the credential.
- Added `npm run observability:configure-alert-routing` so production on-call routing can be enabled from a validated server-only webhook URL file without printing the URL.
- Added `npm run observability:configure-sentry` to mount the production Sentry DSN as a Docker secret on the app service once the DSN is available.
- Production Sentry runtime delivery is configured through a Docker secret-backed `SENTRY_DSN_FILE`, and Alertmanager external Slack routing is configured from a server-only webhook file.
- Landing-mode public navigation now locks to exactly `Contacto` and `Blog` with unit and Playwright coverage.
- Sentry App Router wiring now includes client navigation transition capture, global error capture, a gated build-time Sentry wrapper, and an ignored local `.env.sentry-build-plugin` file for source-map upload auth.
- Buyer and supplier workspaces now have authenticated tRPC `buyer.workspace` and `supplier.workspace` procedures backed by the same scoped workspace loaders as the pages. The global role probe now returns `{ role: null }` for authenticated non-operators so buyer/supplier dashboards do not treat expected non-operator sessions as console errors.
- The Operator Console work queue received a visual polish pass: each row now uses a compact record/status header with balanced transition, edit, and note columns across desktop and mobile.
- Landing mode now treats `/buyer`, `/supplier`, `/security`, and `/v1/*` as
  direct-route surfaces instead of proxy-blocked pages, while keeping public
  navigation locked to Contact/Blog, removing catalogue/security from the
  landing-mode sitemap/robots promotion path, and removing catalogue discovery
  from the security page header and hero actions.
- Public REST catalogue dataset paths now return a default
  `catalogue_deferred` 404, while `/v1` remains directly reachable and documents
  only the current brief-intake and buyer-session API surface unless the future
  catalogue flag is explicitly enabled.
- The platform completion gate now requires representative dataset-build
  evidence for pipeline gates, package artifacts, lineage, release docs, and
  buyer delivery acceptance.

## Verification

- Focused buyer workspace tests, full Vitest, typecheck, lint, i18n parity, production build, migration/rollback validation, disposable fixture seed, and authenticated local role smoke passed.
- Live Postgres readback after `018_buyer_workspace_v1.sql` confirmed seven new buyer workspace columns and one buyer-scoped row each for subscription, invoice, and delivery integration fixtures.
- Supplier Portal v1 focused tests, full Vitest, typecheck, lint, i18n parity, production build, migration/rollback validation, disposable fixture seed, and authenticated local role smoke passed. Disposable readback confirmed one supplier payout, one supplier payout integration, and one Stripe Connect fixture row.
- Supplier Portal v1 live migration, Docker deployment, route probes, production authenticated role smoke, and production public smoke passed for image `mariomedpar/caudals:a911a6c0f49d97c440e97a9fd988d8afe7e4869e`.
- Document/time-series modality coverage passed focused/full Vitest, typecheck, lint, i18n parity, production build, migration rollback/reapply, disposable fixture seed/readback, operator-console smoke, authenticated role smoke, and core route smoke. Live migration/readback, Docker deployment, route probes, production core route smoke, and production authenticated role smoke passed for image `mariomedpar/caudals:7baa23ad6720c831784e7bc6047e5ed31fd8e8f9`.
- Release documentation bundles passed focused/full Vitest, typecheck, lint, i18n parity, production build, migration rollback/reapply, disposable fixture seed/readback, CI, Docker build, live migration/readback, Docker deployment, route probes, production core route smoke, and production authenticated role smoke for image `mariomedpar/caudals:1ba77908a227d9bd0349709682153335902d6527`.
- SOC 2 / ISO 27001 control scoping passed focused/full Vitest, typecheck, lint, i18n parity, production build, migration rollback/reapply, disposable fixture seed/readback, CI, Docker build, live migration/readback, Docker deployment, route probes, production core route smoke, and production authenticated role smoke.
- Public REST v1 originally passed focused/full Vitest, typecheck, lint, i18n parity, production build, CI, Docker build, Docker deployment, route probes, live `/v1` descriptor/catalogue/version/header/validation probes, production core route smoke, and production authenticated role smoke. The current catalogue-deferral correction passed focused route-doc coverage, typecheck, targeted lint, i18n parity, heap-bounded production build, CI, Docker image build, Docker deployment, production `platform:completion-status`, and local/production HTTP probes proving `/v1` returns 200 without catalogue docs while `/v1/datasets` returns `404 catalogue_deferred`.
- Observability passed focused OpenTelemetry unit tests, full Vitest, typecheck, lint, i18n parity, production build, CI, Docker build, private stack config validation, Docker deployment, private readiness probes, Prometheus `up` scrape readback, Loki app-log readback, Tempo `v1.datasets.list` route-span readback, production route probes, and deployed public browser smoke for image `mariomedpar/caudals:938935446944336fd008f95d193d8c59886340d5`.
- Operations lineage validation passed shell syntax checks, Docker stack config
  validation, live Marquez stack deployment, Marquez admin health readback,
  namespace API readback, synthetic OpenLineage `COMPLETE` ingest, and the full
  platform completion gate with the new `operations.stack` check.
- Build cost-envelope validation passed focused/full Vitest, typecheck, lint, i18n parity, production build, targeted diff checks, disposable migration/rollback validation, disposable SQL behavior checks for soft alerts, hard budget blocking, override alerts, and LLM sub-budget blocking, and live migration/readback.
- Escalation runbook validation passed focused/full Vitest, typecheck, lint, i18n parity, production build, disposable full-chain migration and rollback checks, fixture seed/readback, direct SQL trigger readback for R-05 routing plus alert/audit creation, and authenticated local production-server operator-console smoke.
- Security incident runbook validation passed focused operator CRUD/action/workflow tests, typecheck, targeted lint, i18n parity, and disposable migration/rollback/readback proving R-11..R-13 seeds plus `security_event` routing to R-11 with alert/audit evidence.
- Public security review validation passed route/SEO unit tests, full Vitest,
  typecheck, lint, i18n parity, heap-bounded production build, desktop/mobile
  visual inspection, and production direct-route probes; landing mode now keeps
  `/security` unlinked from public navigation while allowing direct access.
- Security review library validation passed disposable migration/readback/rollback, focused/full Vitest, typecheck, lint, i18n parity, and heap-bounded production build.
- Platform completion gate validation now passes the current route, Sentry,
  external alert routing, operator-auth, observability, operations, secret-scan,
  runtime-secret, and pentest-waiver checks; set
  `CAUDALS_PENTEST_GATE_ENABLED=true` to require the quarterly tracker again.
- Private alerting adds Alertmanager and Prometheus rules for scrape failures, host disk pressure, and Prometheus rule/config health. External PagerDuty/on-call routing still requires production contact-point credentials.
- Sentry runtime helper validation passed no-secret failure handling, disposable Swarm secret/service wiring, lint, typecheck, CI, Docker build, production deployment for image `mariomedpar/caudals:59d48ae6b86ec0cf4d2af9343e4b5f6c3b6f64c2`, landing-mode route probes, and the intentionally red platform completion gate.
- Landing-mode navigation validation passed focused unit coverage, lint, typecheck, and the full landing-mode public Playwright route suite with the exact `Contacto`/`Blog` top-nav assertion.
- Operator password-only auth policy passed focused security tests, full Vitest, typecheck, lint, i18n parity, production build, disposable migration/rollback validation, live migration, live audit readback, service env convergence, and production route probes.
- Vulnerability management validation covers YAML parsing, targeted diff checks, dry-run penetration-test tracker generation, and Docker Scout SARIF delivery through the main Docker workflow.
- Sentry App Router follow-up validation passed lint, typecheck, CI, Docker image build, production deployment for image `mariomedpar/caudals:1097614f0ce06f7e7551ce7bf4fa3894f83e9318`, and the intentionally red platform completion gate.
- tRPC workspace validation passed focused router, buyer workspace, supplier workspace, and role-probe route tests; typecheck; lint; dashboard screenshots for admin, buyer, supplier, settings, and mobile views; CI; Docker image build; production deployment for image `mariomedpar/caudals:0585d16137848ea922bf400a4d9cdae0c2ff19b7`; and route probes.
- Work-queue polish validation passed focused operator workflow/action tests, typecheck, lint, i18n parity, and desktop/mobile screenshot inspection with no dashboard console errors or horizontal overflow.
- Latest post-deferral platform completion gate readback passes Sentry runtime delivery, Alertmanager external routing, route, `/v1/datasets` catalogue-deferral, operator-auth, observability-stack, operations-stack, secret-scan, runtime-secret, enforced CVAT readiness, enforced object-storage write/read/delete, and pentest-waiver checks. Set `CAUDALS_PENTEST_GATE_ENABLED=true` to require the quarterly tracker again.
- Landing-mode direct-route correction validation passed focused route/SEO unit
  tests, typecheck, targeted lint, i18n parity, heap-bounded production build,
  GitHub CI, Docker image build, Docker deployment, production
  `platform:completion-status`, production `/buyer` and `/supplier` auth
  redirect probes, `/security` and `/v1` 200 probes, `/catalog` and
  `/catalogue` 404 probes, exact Contacto/Blog navigation readback, and
  desktop/mobile `/security` visual checks with no console errors or horizontal
  overflow.

## Known Gaps / Next M3 Inputs

- Sentry error delivery is enabled through a Docker secret-backed `SENTRY_DSN_FILE`. The Sentry build auth token file is source-map upload auth only, not a runtime DSN; rotate any exposed auth token before enabling uploads. OpenTelemetry traces, Loki logs, and Prometheus metrics are live.
- External Slack notification routing is configured for Alertmanager from a server-only webhook file. Private Prometheus rules and Alertmanager routing are live.
- External penetration-test execution is waived for the current completion gate per product-owner direction; #19 is closed as not planned for this gate.
- Fresh VPS readback passes Sentry runtime delivery and Alertmanager external routing; the completion gate treats the current-quarter pentest tracker as waived unless `CAUDALS_PENTEST_GATE_ENABLED=true`.
- The current service plane has private probes and operator readiness coverage
  for Marquez/OpenLineage, Dagster, Temporal, Label Studio, CVAT, Redis,
  Qdrant, lakeFS, object storage, and observability. The default platform
  completion gate now enforces CVAT readiness plus object-storage
  write/read/delete instead of treating them as waivers.
