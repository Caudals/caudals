# Phase 3 Report

## Current Slice Plan

- Continue M3 after the public catalogue and public buyer-brief intake slices.
- Buyer Workspace v1 shipped as a read-only expansion of `/buyer`: subscriptions, delivery integrations, and billing visibility, scoped to the authenticated buyer organization.
- Ship Supplier Portal v1 as a read-only expansion of `/supplier`: revenue-share payout and Stripe Connect status visibility, scoped to the authenticated supplier organization.
- Keep broader buyer/supplier self-service, purchase flows, payout execution, and hidden marketplace routes unavailable.

## Shipped

- Public catalogue at `/catalogue` and public buyer brief intake are already present in the current branch.
- Buyer Workspace v1 adds buyer-scoped quote, invoice, and delivery-integration fields via `db/migrations/018_buyer_workspace_v1.sql` with rollback coverage.
- `/buyer` now loads subscription operations, delivery integrations, and billing rows through RLS-scoped Postgres queries behind `BUYER_WORKSPACE_V1_ENABLED`.
- Supplier Portal v1 adds supplier-scoped payout integration metadata via `db/migrations/019_supplier_payout_workspace.sql` with rollback coverage.
- `/supplier` now loads payout rows and Stripe Connect account status through RLS-scoped Postgres queries behind `SUPPLIER_PORTAL_V1_ENABLED`.
- Document and time-series modality contracts now extend the operator modality model, creation defaults, and fixtures.
- Release documentation bundles now generate and store G-7 package manifests, Croissant JSON-LD, Article 10 documentation, required docs, validation evidence, and public HF mirror metadata.
- SOC 2 / ISO 27001 scoping now has an operator-owned control register with framework mappings, evidence links, review cadence, readiness states, and audited workflow transitions.
- Versioned `/v1/*` REST now exposes inline API documentation, public catalogue/version/sample reads, public brief/access intake, and buyer-scoped delivery, quote, and subscription actions behind rate limits and Better Auth where required.
- Private observability now runs on `dokploy-network` with OpenTelemetry traces to Tempo, Docker logs to Loki through Promtail, Prometheus metrics for Tempo/Loki/Promtail/cAdvisor, and internal Grafana datasources.
- Private operations lineage now runs on `dokploy-network` with Marquez
  receiving OpenLineage events into a dedicated private PostgreSQL
  role/database and no public ingress.
- Production operator auth now allows password-only access by policy; TOTP and passkeys remain optional Better Auth hardening, JIT elevation remains audited, and reset-link request audit paths are retained.
- Vulnerability management now has weekly Dependabot checks for npm, GitHub Actions, and Dockerfile base images, Docker Scout scans on published app images, and a quarterly penetration-test tracker workflow.
- Build cost envelopes now roll append-only cost ledger entries into build totals, alert at 80%, require explicit override reasons above hard build/LLM/API budgets, and flag >15% margin retrospectives.
- Internal escalation runbooks now have canonical R-01..R-13 records, top-level `escalation_case` routing, automatic alert/audit creation, security-specific R-11..R-13 incident paths, and an Operator Console Escalations module.
- Public security review is implemented at `/security` for non-landing environments, with buyer-facing control evidence, readiness caveats, and DPA/questionnaire follow-up routed to `/contact`; current production `LANDING_MODE` keeps it hidden until explicit clearance.
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

## Verification

- Focused buyer workspace tests, full Vitest, typecheck, lint, i18n parity, production build, migration/rollback validation, disposable fixture seed, and authenticated local role smoke passed.
- Live Postgres readback after `018_buyer_workspace_v1.sql` confirmed seven new buyer workspace columns and one buyer-scoped row each for subscription, invoice, and delivery integration fixtures.
- Supplier Portal v1 focused tests, full Vitest, typecheck, lint, i18n parity, production build, migration/rollback validation, disposable fixture seed, and authenticated local role smoke passed. Disposable readback confirmed one supplier payout, one supplier payout integration, and one Stripe Connect fixture row.
- Supplier Portal v1 live migration, Docker deployment, route probes, production authenticated role smoke, and production public smoke passed for image `mariomedpar/caudals:a911a6c0f49d97c440e97a9fd988d8afe7e4869e`.
- Document/time-series modality coverage passed focused/full Vitest, typecheck, lint, i18n parity, production build, migration rollback/reapply, disposable fixture seed/readback, operator-console smoke, authenticated role smoke, and core route smoke. Live migration/readback, Docker deployment, route probes, production core route smoke, and production authenticated role smoke passed for image `mariomedpar/caudals:7baa23ad6720c831784e7bc6047e5ed31fd8e8f9`.
- Release documentation bundles passed focused/full Vitest, typecheck, lint, i18n parity, production build, migration rollback/reapply, disposable fixture seed/readback, CI, Docker build, live migration/readback, Docker deployment, route probes, production core route smoke, and production authenticated role smoke for image `mariomedpar/caudals:1ba77908a227d9bd0349709682153335902d6527`.
- SOC 2 / ISO 27001 control scoping passed focused/full Vitest, typecheck, lint, i18n parity, production build, migration rollback/reapply, disposable fixture seed/readback, CI, Docker build, live migration/readback, Docker deployment, route probes, production core route smoke, and production authenticated role smoke.
- Public REST v1 passed focused/full Vitest, typecheck, lint, i18n parity, production build, CI, Docker build, Docker deployment, route probes, live `/v1` descriptor/catalogue/version/header/validation probes, production core route smoke, and production authenticated role smoke.
- Observability passed focused OpenTelemetry unit tests, full Vitest, typecheck, lint, i18n parity, production build, CI, Docker build, private stack config validation, Docker deployment, private readiness probes, Prometheus `up` scrape readback, Loki app-log readback, Tempo `v1.datasets.list` route-span readback, production route probes, and deployed public browser smoke for image `mariomedpar/caudals:938935446944336fd008f95d193d8c59886340d5`.
- Operations lineage validation passed shell syntax checks, Docker stack config
  validation, live Marquez stack deployment, Marquez admin health readback,
  namespace API readback, synthetic OpenLineage `COMPLETE` ingest, and the full
  platform completion gate with the new `operations.stack` check.
- Build cost-envelope validation passed focused/full Vitest, typecheck, lint, i18n parity, production build, targeted diff checks, disposable migration/rollback validation, disposable SQL behavior checks for soft alerts, hard budget blocking, override alerts, and LLM sub-budget blocking, and live migration/readback.
- Escalation runbook validation passed focused/full Vitest, typecheck, lint, i18n parity, production build, disposable full-chain migration and rollback checks, fixture seed/readback, direct SQL trigger readback for R-05 routing plus alert/audit creation, and authenticated local production-server operator-console smoke.
- Security incident runbook validation passed focused operator CRUD/action/workflow tests, typecheck, targeted lint, i18n parity, and disposable migration/rollback/readback proving R-11..R-13 seeds plus `security_event` routing to R-11 with alert/audit evidence.
- Public security review validation passed route/SEO unit tests, full Vitest, typecheck, lint, i18n parity, heap-bounded production build, and desktop/mobile visual inspection before the route moved behind the landing-mode gate; current landing-mode unit tests assert `/security` remains blocked.
- Security review library validation passed disposable migration/readback/rollback, focused/full Vitest, typecheck, lint, i18n parity, and heap-bounded production build.
- Platform completion gate validation is intentionally red while external gates remain unfinished; the current run passes route, operator auth policy, and private observability checks and blocks on Sentry, external alert routing, and pentest closure.
- Private alerting adds Alertmanager and Prometheus rules for scrape failures, host disk pressure, and Prometheus rule/config health. External PagerDuty/on-call routing still requires production contact-point credentials.
- Sentry runtime helper validation passed no-secret failure handling, disposable Swarm secret/service wiring, lint, typecheck, CI, Docker build, production deployment for image `mariomedpar/caudals:59d48ae6b86ec0cf4d2af9343e4b5f6c3b6f64c2`, landing-mode route probes, and the intentionally red platform completion gate.
- Landing-mode navigation validation passed focused unit coverage, lint, typecheck, and the full landing-mode public Playwright route suite with the exact `Contacto`/`Blog` top-nav assertion.
- Operator password-only auth policy passed focused security tests, full Vitest, typecheck, lint, i18n parity, production build, disposable migration/rollback validation, live migration, live audit readback, service env convergence, and production route probes.
- Vulnerability management validation covers YAML parsing, targeted diff checks, dry-run penetration-test tracker generation, and Docker Scout SARIF delivery through the main Docker workflow.
- Sentry App Router follow-up validation passed lint, typecheck, CI, Docker image build, production deployment for image `mariomedpar/caudals:1097614f0ce06f7e7551ce7bf4fa3894f83e9318`, and the intentionally red platform completion gate.
- tRPC workspace validation passed focused router, buyer workspace, supplier workspace, and role-probe route tests; typecheck; lint; dashboard screenshots for admin, buyer, supplier, settings, and mobile views; CI; Docker image build; production deployment for image `mariomedpar/caudals:0585d16137848ea922bf400a4d9cdae0c2ff19b7`; and route probes.
- Work-queue polish validation passed focused operator workflow/action tests, typecheck, lint, i18n parity, and desktop/mobile screenshot inspection with no dashboard console errors or horizontal overflow.
- Latest platform completion gate readback on image `mariomedpar/caudals:49d91032f88cf05a11215ba7b7f263410c6ec73f` now passes Sentry runtime delivery, Alertmanager external routing, route, operator-auth, observability-stack, operations-stack, secret-scan, runtime-secret, and pentest-waiver checks. Set `CAUDALS_PENTEST_GATE_ENABLED=true` to require the quarterly tracker again.

## Known Gaps / Next M3 Inputs

- Sentry error delivery is enabled through a Docker secret-backed `SENTRY_DSN_FILE`. The Sentry build auth token file is source-map upload auth only, not a runtime DSN; rotate any exposed auth token before enabling uploads. OpenTelemetry traces, Loki logs, and Prometheus metrics are live.
- External Slack notification routing is configured for Alertmanager from a server-only webhook file. Private Prometheus rules and Alertmanager routing are live.
- External penetration-test execution is waived for the current completion gate per product-owner direction; #19 is closed as not planned for this gate.
- Fresh VPS readback passes Sentry runtime delivery and Alertmanager external routing; the completion gate treats the current-quarter pentest tracker as waived unless `CAUDALS_PENTEST_GATE_ENABLED=true`.
- Marquez/OpenLineage is the first production operations-service slice. Dagster,
  Temporal, and labeling/review runtimes remain future operations-service
  slices before the blueprint service plane can be considered complete.
