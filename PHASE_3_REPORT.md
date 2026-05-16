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
- Production operator MFA is required for non-fixture accounts: TOTP enrollment gates `/admin`, fixture accounts remain password-only for automated smoke tests, and reset-link requests are audited.
- Vulnerability management now has weekly Dependabot checks for npm, GitHub Actions, and Dockerfile base images, Docker Scout scans on published app images, and a quarterly penetration-test tracker workflow.
- Build cost envelopes now roll append-only cost ledger entries into build totals, alert at 80%, require explicit override reasons above hard build/LLM/API budgets, and flag >15% margin retrospectives.
- Internal escalation runbooks now have canonical R-01..R-10 records, top-level `escalation_case` routing, automatic alert/audit creation, and an Operator Console Escalations module.
- Public security review is implemented at `/security` for non-landing environments, with buyer-facing control evidence, readiness caveats, and DPA/questionnaire follow-up routed to `/contact`; current production `LANDING_MODE` keeps it hidden until explicit clearance.
- The public security review page is now backed by `security_review_artifact`, an RLS-scoped library of published questionnaire answers, DPA review-path notes, and evidence packet items.
- Added a VPS-side platform completion gate, `npm run platform:completion-status`, that aggregates the final production checks for landing-mode routing, Sentry, operator MFA, private observability readiness, external alert routing, and the current-quarter pentest tracker.
- Alertmanager deployment now supports rendering a private external webhook receiver from `CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE` or `CAUDALS_ALERTMANAGER_WEBHOOK_URL` without committing the credential.
- Added `npm run observability:configure-sentry` to mount the production Sentry DSN as a Docker secret on the app service once the DSN is available.

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
- Build cost-envelope validation passed focused/full Vitest, typecheck, lint, i18n parity, production build, targeted diff checks, disposable migration/rollback validation, disposable SQL behavior checks for soft alerts, hard budget blocking, override alerts, and LLM sub-budget blocking, and live migration/readback.
- Escalation runbook validation passed focused/full Vitest, typecheck, lint, i18n parity, production build, disposable full-chain migration and rollback checks, fixture seed/readback, direct SQL trigger readback for R-05 routing plus alert/audit creation, and authenticated local production-server operator-console smoke.
- Public security review validation passed route/SEO unit tests, full Vitest, typecheck, lint, i18n parity, heap-bounded production build, and desktop/mobile visual inspection before the route moved behind the landing-mode gate; current landing-mode unit tests assert `/security` remains blocked.
- Security review library validation passed disposable migration/readback/rollback, focused/full Vitest, typecheck, lint, i18n parity, and heap-bounded production build.
- Platform completion gate validation is intentionally red while external gates remain unfinished; the current run passes route and private observability checks and blocks on Sentry, real-operator MFA enrollment, external alert routing, and pentest closure.
- Private alerting adds Alertmanager and Prometheus rules for scrape failures, host disk pressure, and Prometheus rule/config health. External PagerDuty/on-call routing still requires production contact-point credentials.
- Sentry runtime helper validation passed no-secret failure handling, disposable Swarm secret/service wiring, lint, typecheck, CI, Docker build, production deployment for image `mariomedpar/caudals:59d48ae6b86ec0cf4d2af9343e4b5f6c3b6f64c2`, landing-mode route probes, and the intentionally red platform completion gate.
- Operator MFA enforcement passed focused security tests, full Vitest, typecheck, lint, i18n parity, production build, disposable migration/rollback validation, live migration, live audit readback, reset-link dispatch for three eligible operators, service env convergence, and production route probes.
- Vulnerability management validation covers YAML parsing, targeted diff checks, dry-run penetration-test tracker generation, and Docker Scout SARIF delivery through the main Docker workflow.

## Known Gaps / Next M3 Inputs

- Do not mark the full platform goal done until live operator MFA enrollment is complete. The policy conflict has been resolved in favor of required production TOTP with a fixture-only smoke-test exemption; three reset-eligible real operators were resent setup links on 2026-05-16 and still need to complete their own authenticator setup.
- Sentry error delivery remains disabled until `SENTRY_DSN` or the server-only `SENTRY_DSN_FILE` Docker secret fallback is configured in production. OpenTelemetry traces, Loki logs, and Prometheus metrics are live.
- External PagerDuty/on-call notification routing still requires production contact-point credentials. Private Prometheus rules and Alertmanager routing are live.
- External penetration-test execution still requires Security/CTO to assign the tester or vendor and close the generated quarterly tracker with findings and retest evidence.
