# Phase 2 Report

## Current Slice Plan

- Audit the M2 roadmap bullets against shipped code, schema, tests, CI, and the running VPS deployment.
- Record concise production evidence so M3 can start without rediscovering M2 status.
- Keep known gaps limited to the blueprint's M3 handoff items.

## Shipped

- Catalogue listing, private-offer, and sample-preview gating: `db/migrations/012_catalogue_preview_gating.sql`, `sample_preview_access`, operator CRUD fields, state transitions, gating helper, fixtures, and tests.
- Video, audio, and geospatial modality coverage: `db/migrations/013_modality_contracts_enrichment.sql`, `modality_contract`, `enrichment_manifest`, modality contract templates, enrichment evidence validation, operator controls, fixtures, and tests.
- Active-learning loop: `db/migrations/014_active_learning_loop.sql`, `active_learning_loop`, `active_learning_candidate`, FiftyOne/Lightly-style candidate ranking, evidence gates, fixtures, and tests.
- Cleanlab QA pass: `db/migrations/015_cleanlab_qa_pass.sql`, `cleanlab_qa_pass`, `cleanlab_label_issue`, QA-report sync trigger, acceptance/requeue validation, fixtures, and tests.
- Subscription delivery model: `db/migrations/016_subscription_delivery.sql`, `subscription`, `delta_manifest`, delivery receipt sync, per-increment rights/privacy/QA evidence, fixtures, and tests.
- Buyer workspace v0: authenticated `/buyer` read-only delivery, scorecard, manifest, delta, subscription, privacy, license, and acceptance-evidence review.
- Supplier portal v0: authenticated `/supplier` managed asset declaration, signed sample upload, supplier-owned asset registry, and build participation review.
- Landing-mode route separation remains intact: `/admin`, `/buyer`, and `/supplier` are authenticated exceptions; pre-pivot self-serve routes remain hidden.

## Production Evidence

- Deployed image: `mariomedpar/caudals:733ed6d33c63ffab2b83607579f35e425acaa8c9` on `caudalsdep-caudals-vgbvxp`.
- GitHub checks for `733ed6d33c63ffab2b83607579f35e425acaa8c9`: branch CI, main CI, and Docker build all completed successfully.
- Live Postgres readback confirmed `sample_preview_access`, `modality_contract`, `enrichment_manifest`, `active_learning_loop`, `cleanlab_qa_pass`, `subscription`, `delta_manifest`, and supplier portal columns exist.
- Live fixture/readback counts confirmed one active row for each M2 operator record family and one supplier asset linked to a supplier organization.
- Production route probes passed: public pages returned `200`, `/admin`, `/buyer`, `/supplier` redirected to sign-in, and hidden legacy routes returned `404`.
- Production Playwright passed: `e2e/smoke.spec.ts` 6/6 and `e2e/authenticated-role-smoke.spec.ts` 3/3.
- Focused M2 unit tests passed: 9 files, 26 tests.

## Deviations

- None new for M2. Catalogue exposure remains operator/private-workspace only; public `/catalogue` is intentionally deferred to M3 by the blueprint.

## Known Gaps / M3 Inputs

- Public curated catalogue at `/catalogue`.
- Public buyer brief intake routed into the operator queue.
- Buyer workspace v1 for subscriptions, integrations, and billing.
- Supplier portal v1 for revenue share and Stripe Connect payout visibility.
- Document and time-series modality coverage at production quality.
- EU AI Act Article 10 documentation generation, Croissant manifest default emission, and Hugging Face mirror channel.
- SOC 2 Type I / ISO 27001 scoping and the full Prometheus/Loki/Tempo observability stack remain platform-done requirements.
