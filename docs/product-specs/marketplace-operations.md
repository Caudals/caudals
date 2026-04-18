# Marketplace Operations Spec

## Workflow Guarantees
- Company data transactions are mediated by Caudals operators until the marketplace is relaunched.
- State transitions are auditable: lead, qualified, feasibility, pilot, build, catalog-ready, delivered, renewed, rejected.
- Dataset rights, provenance, PII status, quality score, schema, and delivery artifacts are visible in internal admin records.
- Payment-affecting events must remain idempotent when payment workflows are reintroduced.

## Buyer Company Workflow
1. Buyer submits a dataset need through `/contact` or a private sales channel.
2. Caudals qualifies data type, industry, geography, freshness, volume, format, budget, timeline, and AI use case.
3. Caudals checks whether the need maps to an existing catalog candidate, a supplier-led build, public data enrichment, or a custom sourcing project.
4. Caudals delivers one of:
   - feasibility study,
   - pilot dataset,
   - full dataset build,
   - private marketplace offer.
5. Buyer reviews samples, schema, QA report, rights summary, and delivery terms before purchase or continuation.

Buyer critical UX/admin requirements:
- every buyer lead needs a clear next action and owner,
- dataset requirements must be structured enough to estimate scope,
- sample previews and quality reports must never imply rights that have not been cleared,
- delivery artifacts must include format, schema, license, freshness, and known limitations.

## Supplier Company Workflow
1. Supplier submits available data or a monetization interest through `/contact` or direct outreach.
2. Caudals evaluates commercial fit, data rights, sensitivity, compliance constraints, uniqueness, freshness, and buyer demand.
3. Caudals scopes ingestion and processing: source access, schema discovery, deduplication, anonymization, enrichment, labeling, QA, and update cadence.
4. Caudals builds a pilot or full dataset listing.
5. Supplier receives revenue share on approved sales once commercial terms are signed.

Supplier critical UX/admin requirements:
- data rights and AI-training permission must be explicit before any marketplace listing,
- sensitive data requires PII detection, minimization, anonymization, and review,
- suppliers should see a simple monetization path, not labeling or marketplace tooling complexity,
- supplier revenue share terms should be recorded per listing or private offer.

## Internal Admin Dashboard Workflow
The admin dashboard is the only app surface to preserve in the near term.

Primary jobs:
- triage buyer and supplier leads,
- track feasibility studies, pilot builds, and full dataset builds,
- maintain supplier data-room metadata,
- review rights, provenance, PII, QA, and delivery readiness,
- publish or hide marketplace listings,
- monitor commercial state: quotes, contracts, invoices, renewals, revenue share.

Required future admin modules:
- Leads: buyer/supplier/company intake with qualification status.
- Supplier Assets: source metadata, rights, sensitivity, schema profile, access method.
- Dataset Builds: pipeline stages, owner, blockers, QA status, acceptance criteria.
- Catalog Listings: title, description, schema, sample, quality score, pricing, visibility.
- Commercial Ops: quote, contract, license term, invoice/payment status, supplier share.
- Audit Log: all high-risk changes to rights, PII status, pricing, and publication state.

Failure modes to prevent:
- public listing without cleared rights,
- buyer delivery without QA and license summary,
- supplier asset with unknown PII status,
- stale marketplace listing with expired data or unclear refresh cadence,
- hidden blockers in active dataset builds.
