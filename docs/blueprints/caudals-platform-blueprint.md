# Caudals — Platform Blueprint

**A Technical Blueprint · Volume 01**

> The Dataset Operations Platform.

A complete technical blueprint for designing, building and operating the software platform behind Caudals — the B2B marketplace and managed services layer for AI-ready, compliant, ML-grade datasets.

| | |
|---|---|
| **Document** | 01 |
| **Revision** | 1.2 — Optional operator MFA/passkey enforcement |
| **Date issued** | 09 May 2026 |
| **Owner** | Caudals Platform Engineering |
| **Status** | Approved for engineering execution |
| **Classification** | Internal · do not distribute externally |
| **Supersedes** | All prior internal architecture drafts |
| **Pairs with** | `AGENTS.md` · `docs/ARCHITECTURE.md` · `docs/product-specs/overview.md` |
| **Prepared for** | Caudals Founding Team — Engineering, Operations, Strategy |
| **Scope** | Dataset operations · Marketplace · Internal admin · Delivery |

---

## 00 · Document Control

### A blueprint for the operational layer of B2B AI data

This document is the canonical technical specification for the Caudals platform. It describes the system architecture, technology stack, data operations pipeline, product surfaces, internal tooling, and operating model required to source, build, and deliver multi-modal AI datasets at professional B2B quality. Every implementation decision in this repository should trace back to a clause in this document.

#### Audience

Caudals founders, platform engineers, data engineers, ML engineers, data scientists, operations and labeling reviewers, security and compliance leads, and any external collaborators contracted to extend the platform.

#### Reading order

1. Executive summary & the operating model.
2. System architecture and technology stack.
3. The dataset operations pipeline (Part II) — the core of the business.
4. Product surfaces (Part III) and internal operations (Part IV).
5. Implementation roadmap and risk register (Part V).

#### Out of scope

Marketing copy, pricing rate cards, individual customer integrations, and specific commercial contracts. Those live in adjacent documents and change at higher cadence.

#### Conventions

**MUST / SHOULD / MAY** follow RFC 2119. Code, paths and identifiers appear in `monospace`. Names of external products are cited only as references; final selection happens in §05 (Technology Stack). Diagrams are illustrative; the source of truth for schema and APIs is the implementation, kept in sync via contract tests described in §29.

#### Document scale

- **5** Parts
- **34** Sections
- **9** Pipeline stages
- **8** Data modalities

#### Changelog

- **1.1** — Replaces platform OLTP/auth target with self-hosted PostgreSQL + Better Auth for Phase 1.
- **1.2** — Makes operator TOTP/passkey enrollment optional by default while retaining the Better Auth factor flows.

---

## Contents

### Five parts. Thirty-four sections. One platform.

#### Part I · Strategic & architectural foundation

- 01 — Mission and platform thesis
- 02 — Operating model — buyers, suppliers, operators
- 03 — Architectural principles
- 04 — System architecture overview
- 05 — Technology stack

#### Part II · The Dataset Operations Platform

- 06 — The dataset lifecycle — medallion model
- 07 — Acquisition and intake
- 08 — Profiling
- 09 — Cleaning and normalization
- 10 — Privacy and PII handling
- 11 — Enrichment
- 12 — Labeling, curation & active learning
- 13 — QA and quality scoring
- 14 — Packaging and format generation
- 15 — Publication and delivery
- 16 — Versioning, lineage and provenance
- 17 — Build-from-existing-data — the derivation engine
- 18 — Multi-modality — eight first-class types

#### Part III · Product surfaces

- 19 — Internal admin / operator console
- 20 — Buyer workspace
- 21 — Supplier portal
- 22 — Public marketing & demand capture

#### Part IV · Operations

- 23 — Workflows and state machines
- 24 — Internal tooling and runbooks
- 25 — Security, compliance, governance
- 26 — Observability and telemetry
- 27 — Cost and capacity planning

#### Part V · Implementation

- 28 — Data model & schema
- 29 — API surface
- 30 — Implementation roadmap
- 31 — Team structure & RACI
- 32 — Risks and mitigations
- 33 — Glossary
- 34 — References & canonical sources

---

## Executive Summary

### What we are building, and why it has to exist now

AI teams are running out of usable data, while data-rich companies sit on proprietary assets they cannot safely sell. Caudals exists to close that gap. This blueprint describes the platform required to do so professionally — at the level of rigour expected of regulated B2B infrastructure, not a consultancy with spreadsheets.

#### The thesis

The market needs a trusted operational layer between data suppliers and AI buyers. Marketplaces alone are listing directories; labeling vendors alone do not solve sourcing or licensing; consultancies do not scale. Caudals combines marketplace gravity, supplier-side monetization, managed dataset engineering, and rights/provenance/privacy review into a single platform with a published catalogue and bespoke build capacity.

#### The platform

The Caudals platform is structured around three concentric rings:

1. **Ring 1 — Public surface.** Landing, blog, contact, and demand-capture APIs. Already live; the front door for buyers and suppliers.
2. **Ring 2 — Internal operations.** The admin console where operators run the business: leads, supplier assets, builds, QA, contracts, deliveries, and audit history.
3. **Ring 3 — Dataset Operations Platform.** The engineering core: a medallion-architected pipeline that turns raw supplier data into ML-ready, licensed, audited dataset artefacts across eight modalities.

#### Where the moat is

The competitive moat is not the labeling UI or the marketplace listing page. It is the *operations spine*: a unified data model for assets, rights, builds, runs, labels, lineage, QA, contracts and deliveries; a programmable pipeline that composes profiling, cleaning, privacy, enrichment, labeling, QA and packaging as reusable assets; and an audit trail strong enough to satisfy enterprise procurement, EU AI Act Article 10 documentation, and supplier revenue-share contracts.

#### Build sequencing

The roadmap (§30) commits to a 90-day, 6-month and 12-month sequence. The 90-day target is operator-grade: an admin console capable of running five concurrent dataset builds end-to-end with full lineage and licensed delivery. Buyer and supplier self-service ship after operations are reliable.

#### The one-line product

> A managed B2B platform that turns proprietary company data into licensed, ML-ready datasets, with auditable provenance, privacy handling and quality scoring — sold privately or through a curated catalogue.

#### Hard constraints

- **Provenance is non-negotiable.** Every record must trace to a source, a contract, and a permitted-use clause.
- **Privacy by default.** PII is detected at ingest, not at delivery.
- **Licensing is data, not paper.** Permitted uses, derivative rights, exclusivity, geography and term live on the asset, not in a PDF.
- **Builds are reproducible.** Any released dataset version can be rebuilt byte-for-byte from its lineage manifest.
- **Modalities are first-class.** Tabular, text, image, video, audio, geospatial, time-series and document datasets share one platform.

#### North-star metrics

| Metric | Target |
|---|---|
| Time-to-pilot | ≤ 14 days |
| Build reproducibility | 100% |
| PII leak incidents | 0 / quarter |
| License audit pass | ≥ 99% |
| Avg QA score released | ≥ 0.85 |

> "The goal is not to be a listing directory, a labeling provider, or a consulting shop. The goal is to be the trusted transaction and operations layer for AI-ready B2B datasets." — *Caudals overview, internal.*

---

# Part I · Strategic & Architectural Foundation

Five sections establishing why Caudals exists, how its operating model works, and the architectural principles every implementation choice in this document descends from. Read first; everything else assumes it.

- 01 — Mission & thesis
- 02 — Operating model
- 03 — Principles
- 04–05 — Architecture & stack

---

## 01 · Mission and platform thesis

### A platform between the data-rich and the model-hungry

The strategic premise: AI capability has decoupled from training data quality. Compute is plentiful, models are commoditized, and yet most domain-specific AI fails because the underlying datasets are stale, legally ambiguous, biased, or simply not granular enough. Meanwhile, operationally rich companies sit on data that would be transformative for a buyer two industries away — but they have no compliant path to sell it.

### The market gap, precisely

#### What buyers cannot get

- Domain-specific training and evaluation data with documented provenance.
- Datasets legally cleared for AI training, fine-tuning and commercial inference.
- ML-ready formats with verifiable PII handling and bias documentation.
- Custom builds with feasibility memos, samples, schemas and QA scorecards *before* commitment.
- Recurring data feeds with versioning, lineage, and a refresh contract.

#### What suppliers cannot do alone

- Stand up a sales pipeline aimed at AI buyers they cannot identify.
- Run a privacy / consent / DSAR pipeline for derivative datasets.
- Negotiate AI-training licenses without external counsel.
- Package data into Parquet, JSONL, COCO, YOLO, TFRecords, WebDataset.
- Operate a marketplace, payments rail, and support function around data products.

### The Caudals thesis

Caudals occupies the empty quadrant in this map: a managed operations layer with marketplace gravity. Three things happen on the platform that do not happen anywhere else in one place:

1. **Sourcing & rights.** We identify supplier-side proprietary data, validate AI-training and commercial-inference rights, and convert that legal posture into machine-readable license records.
2. **Engineering.** We run the dataset operations pipeline (Part II) as a programmable system — not as a bespoke per-project script. Profiling, cleaning, privacy, enrichment, labeling, QA, packaging and delivery compose like Lego blocks per build.
3. **Distribution.** We package each accepted dataset as a catalogue listing or a private offer with versioning, refresh cadence, revenue share, and acceptance evidence.

### What Caudals is not

- **Not a labeling vendor.** Labeling is one stage of nine.
- **Not only a marketplace directory.** Listings without operations are commodities.
- **Not a consultancy.** Bespoke project work runs through productized pipelines, not custom scripts.
- **Not a platform sold to AI labs only.** The buyer base is enterprise ML teams across regulated and unregulated verticals.

---

## 02 · Operating model

### Three sides, one operations spine

The platform serves three populations whose workflows must be modelled as distinct surfaces with distinct permissions, but which converge on a single internal system of record. Everything — lead, asset, build, contract, delivery — is one row in one connected schema described in §28.

```
┌──────────────┐     brief      ┌──────────────────────┐     offer      ┌──────────────┐
│              │ ─────────────► │                      │ ◄───────────── │              │
│   BUYERS     │                │   CAUDALS            │                │  SUPPLIERS   │
│ AI/ML teams  │                │   OPERATIONS SPINE   │                │ Data-rich    │
│              │ ◄───────────── │                      │ ─────────────► │ orgs         │
└──────────────┘    delivery    └──────────────────────┘     data       └──────────────┘
```

The Caudals operations spine owns: lead & opportunity ledger · supplier asset registry · rights & license vault · build orchestrator · QA & release control · catalogue & offers · contracts & revenue share.

### Buyer-side operations

Buyers enter through (a) the public contact funnel, (b) outbound sales, (c) catalogue self-service once exposed, or (d) referral. Each entry becomes a `buyer_opportunity` record that progresses through qualification, scoping, sampling, quoting, contracting, delivery and renewal. Buyer-side product surfaces are described in §20.

### Supplier-side operations

Suppliers enter through (a) outbound sourcing, (b) the public contact funnel for monetization interest, or (c) referral from existing partners. Each becomes a `supplier_organization` with a registry of `supplier_asset` records, each with its own provenance, consent posture, rights declaration and dataset suitability. Supplier-side product surfaces are described in §21.

### Internal operations

The Caudals operations team runs the business through a single console (§19) that exposes every record needed to qualify, build, audit, ship and bill datasets. The operating model is intentionally operator-led for the first 12 months: self-service buyer/supplier flows ship only after the operations spine is reliable and the catalogue is populated.

---

## 03 · Architectural principles

### Twelve principles. Every implementation choice descends from these.

These are not aspirations. They are constraints. A pull request that violates one of these without an explicit, documented exception in this blueprint should be rejected.

**P-01 · Single source of truth.** Every business object — lead, asset, build, run, label batch, QA report, contract, delivery — lives in exactly one canonical table. No shadow spreadsheets. Reports are derived; assertions are authoritative.

**P-02 · Datasets are assets, not pipelines.** We treat each materialized dataset version as a first-class asset with a manifest, a hash, a license, a lineage graph, and an immutable content URI. Pipelines produce assets; assets are the unit of release.

**P-03 · Medallion layering.** All data flows through **bronze** (raw + provenance stamp), **silver** (cleaned, conformed, PII-handled), and **gold** (ML-ready, packaged, scored). Layers never skip forward; promotion requires explicit gates (§13).

**P-04 · Reproducible builds.** Any released dataset version MUST be byte-reconstructible from its lineage manifest, given access to the original sources and the pipeline code at the manifest's git SHA. No "I think we used this script" recovery paths.

**P-05 · Privacy at ingest.** PII detection runs at the bronze boundary. Sensitive data never reaches silver in the clear without a recorded justification, a recorded permitted-use, and a recorded retention policy.

**P-06 · Licenses are code.** Every record's permitted uses, derivative rights, exclusivity, geography, channel and term live in structured fields evaluated by policy code. PDF contracts attach as evidence; they are not the source of truth.

**P-07 · Modality-agnostic core, modality-specific edges.** The orchestration, lineage, QA, license and audit layers do not know about modalities. Modality-specific tools (CV viewers, audio waveform labelers, geospatial tilers) plug in at well-defined interfaces.

**P-08 · Async, idempotent, auditable.** All non-trivial operations run as durable, idempotent jobs with retries, with structured audit events emitted to one log spine. No browser sessions own multi-hour work.

**P-09 · Buyer-grade trust signals are visible.** Provenance, license, PII status, freshness, schema, QA score and sample preview are exposed as first-class UI primitives, not buried in attachments. Trust is operational, not marketing.

**P-10 · Operators before self-service.** Internal admin workflows precede buyer/supplier self-service for the first 12 months. Self-service ships only after operator workflows for that capability are stable and load-bearing.

**P-11 · Regulated by default.** The platform is built to a posture compatible with EU AI Act Article 10, GDPR, CCPA/CPRA, and SOC 2 Type II readiness from day one. Markets without these obligations cost nothing extra; markets with them are accessible.

**P-12 · Boring infrastructure.** We choose mature, well-instrumented infrastructure with strong operational track records. Novelty in the dataset operations layer; conservatism everywhere else.

> "Provenance, freshness, license, PII, QA score and sample preview are not metadata — they are the product."

---

## 04 · System architecture overview

### Five planes. One data fabric.

The Caudals platform is structured as five horizontal planes, each with a clear responsibility and a clear interface to its neighbours. Anything new must fit somewhere on this map; if it does not, the map is wrong and must be updated before code lands.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PLANE 5 · EXPERIENCE                                                            │
│  Marketing site · Buyer workspace · Supplier portal · Internal console           │
│  Next.js · React 19 · Tailwind                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PLANE 4 · SERVICES & API                                                        │
│  Server actions · tRPC/REST · Auth · Permissions · Webhooks                      │
│  Node · TypeScript · Better Auth                                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PLANE 3 · DATASET OPERATIONS — THE CORE                                         │
│  Orchestrator · Profilers · Cleaners · PII · Enrichers · Labeling · QA · Packagers│
│  Dagster · Temporal · Python · GPU pool                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PLANE 2 · DATA FABRIC                                                           │
│  Object store · Lakehouse tables · Vector index · Postgres OLTP · Lineage        │
│  S3-compat · Iceberg · Lance · pgvector                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PLANE 1 · INFRASTRUCTURE                                                        │
│  Compute · Networking · Secrets · Identity · Observability                       │
│  Docker · Dokploy · DigitalOcean · Tailscale                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  CROSS-CUTTING · AUDIT · LINEAGE · LICENSE · PRIVACY · SECURITY · COST           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Plane responsibilities

| Plane | Owns | Must not |
|---|---|---|
| 5 · Experience | Rendering, IA, locale, accessibility, design system, optimistic UI. | Hold business invariants. Talk to the data fabric directly. |
| 4 · Services | Auth, RBAC, server actions, REST/tRPC routes, webhooks, idempotency, audit emit. | Run multi-minute work synchronously. Embed pipeline logic. |
| 3 · Operations core | Pipeline orchestration, modality workers, GPU/CPU job execution, lineage emission, run state. | Render UI. Hold customer-facing identity. |
| 2 · Data fabric | OLTP records, lakehouse tables, object storage, vector indexes, lineage graph. | Run business logic. Make external calls. |
| 1 · Infrastructure | Compute, networking, identity, secrets, deployment, monitoring. | Hold business state. |

### Deployment topology

- **Edge / public** — Marketing site, blog, contact & waitlist APIs, public catalogue (when released). Cached, rate-limited, isolated from operations VPC.
- **App / private** — Internal console, buyer/supplier auth surfaces, server actions, webhooks. Behind auth + Tailscale-restricted admin.
- **Operations VPC** — Postgres, lakehouse, object store, orchestrator, GPU pool, vector index, observability stack. No public ingress beyond signed URLs and approved API gateway paths.

---

## 05 · Technology stack

### Boring where we can. Specialized where the moat lives.

The stack favours mature, instrumented technology with strong operational track records, and reserves novel choices for the dataset operations plane (§3) where Caudals' competitive moat is built. Every selection below either continues the existing repo direction or has an explicit upgrade path documented in §30.

### Plane 5 · Experience

| Layer | Choice | Why | Alternatives considered |
|---|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript | Existing repo direction; SSR + RSC fit B2B latency profile. | Remix, SvelteKit |
| UI | Tailwind v4 + Radix UI + shadcn primitives | Editorial-grade tokens (§DESIGN.md) already in place. | Mantine, Chakra |
| Charts | Recharts + custom SVG, ECharts for ops dashboards | Lightweight, restrained, design-system-friendly. | Plotly, D3 raw |
| Tables | TanStack Table, virtualized rows for ops grids | Standard for ops-grade screens with 10k+ rows. | AG-Grid (license cost) |
| i18n | Existing translation pipeline; en + es as canonical | Spain locale is a strong market signal. | next-intl direct |

### Plane 4 · Services & API

| Layer | Choice | Why | Alternatives |
|---|---|---|---|
| Runtime | Node 22 LTS, TypeScript strict mode | Continuity; ecosystem. | Bun (revisit at year 2) |
| API style | Server Actions internally; tRPC for buyer/supplier; signed REST for partner integrations | Type-safe across boundaries; minimal contract drift. | GraphQL (overkill at this scale) |
| Auth | Better Auth + Postgres adapter; org-scoped roles; SSO scaffolded for Phase 3 | Cookie sessions and optional operator MFA/passkeys live in-app while Postgres RLS remains the tenancy boundary. | Auth0, WorkOS |
| Webhooks | Idempotent receivers, replay log, signed events | Required for Stripe + supplier-side integrations. | — |
| Email | Resend with audited templates & suppressions | Transactional + light marketing. | Postmark |
| Payments | Stripe (Connect for supplier revenue share) | Standard for B2B; revenue share via Connect transfers. | Adyen |

### Plane 3 · Dataset operations core

| Layer | Choice | Why this, not the obvious thing |
|---|---|---|
| Asset orchestrator | **Dagster** | Datasets-as-assets is the right mental model; software-defined assets, partitions, backfills, type-checked IO managers. |
| Durable workflows | **Temporal** | Multi-day human-in-the-loop labeling and supplier interaction flows must survive process death; activities + signals fit perfectly. |
| Compute | Python 3.12 workers; GPU pool on-demand for CV/audio/embeddings | Dagster ops dispatch to a GPU pool via Kubernetes or DO managed nodes. |
| Tabular engine | **Polars** + DuckDB (in-process), Spark only for >TB jobs | Polars is dramatically faster than pandas at our scale; DuckDB for SQL-shaped exploration. |
| Profiling | whylogs (streamed sketches) + ydata-profiling for one-shot reports | whylogs is privacy-safe and prod-runnable; ydata for human-readable reports. |
| Quality gates | Great Expectations (suites) + Pandera (typed dataframes) | GE for declarative assertions; Pandera as type-system in pipeline code. |
| PII / privacy | Microsoft **Presidio** + spaCy NER + custom recognizers; OpenDP for tabular DP synthesis | Presidio's recognizer registry is extensible; OpenDP is the only mature DP toolkit. |
| Labeling | **Label Studio** embedded; CVAT for video; Argilla for LLM feedback | OSS, scriptable, multi-modal; we run them as managed components, not external services. |
| Active learning | FiftyOne Brain + Lightly-style embedding selection | Uncertainty + diversity sampling; pluggable behind a Caudals interface. |
| Synthetic data | SDV (multi-table) + Gretel for DP tabular when needed | SDV is open and composable; Gretel for regulated DP guarantees. |
| Document parsing | Unstructured + LlamaParse + AWS Textract fallback | Layout-aware OCR is the bottleneck for document datasets. |
| Embeddings | BGE / E5 family + custom domain encoders | OSS, on-prem-able, no vendor lock-in for vectors. |

### Plane 2 · Data fabric

| Layer | Choice | Why |
|---|---|---|
| OLTP | Self-hosted Postgres 16 via Dokploy | Direct control of extensions, RLS, backups, migration cadence, and Phase 1 operator schema. |
| Object store | DigitalOcean Spaces (S3-compatible) + R2 for cross-region delivery | S3 API compatibility; existing repo wiring. |
| Lakehouse tables | **Apache Iceberg** on object store, queried by DuckDB / Trino | Vendor-neutral table format; works with every engine. |
| Tensor / unstructured | **Lance** format for image/video/audio collections; WebDataset for streaming training | Random-access columnar tensors; GPU-friendly streaming. |
| Vector index | pgvector for catalogue search; **Qdrant** for high-cardinality similarity at build time | pgvector co-locates with OLTP; Qdrant for filtered ANN at scale. |
| Versioning | **lakeFS** over object store | Git-like branches/commits over petabyte data without copies. |
| Lineage | **OpenLineage** events → Marquez backend | Vendor-neutral spec; Dagster / Spark / Airflow all emit it. |
| Cache / queue | Redis (BullMQ) for low-latency jobs; Temporal for durable | Two-tier queue: ephemeral vs durable. |

### Plane 1 · Infrastructure & cross-cutting

| Layer | Choice |
|---|---|
| Container runtime | Docker + Dokploy on DigitalOcean VPS (current) |
| Orchestration (year 2) | Managed Kubernetes when GPU pool exceeds 4 nodes |
| Networking | Tailscale for admin, Traefik / Kong for public |
| Secrets | Doppler / Infisical; encrypted Postgres columns for per-org integration material |
| CI/CD | GitHub Actions → Docker Hub → Dokploy |
| Logs | OpenTelemetry → Grafana Loki |
| Metrics | Prometheus + Grafana |
| Traces | OpenTelemetry → Tempo |
| Errors | Sentry |
| Analytics | Umami (existing) for marketing; PostHog for product |

> "Datasets are first-class assets. Pipelines produce assets; assets are the unit of release. Choose tools that respect that hierarchy." — *Principle P-02*

---

# Part II · The Dataset Operations Platform

Thirteen sections describing the core engineering system — the pipeline that turns raw supplier data into ML-ready datasets across eight modalities. This is where the company's value is created. The rest of the platform exists to feed and harvest from this core.

- 06 — Lifecycle & medallion
- 07–15 — Nine pipeline stages
- 16–17 — Lineage & derivation
- 18 — Multi-modality

---

## 06 · The dataset lifecycle

### From raw record to released asset, nine gates

Every dataset built at Caudals passes through the same nine-stage pipeline, regardless of modality, customer, or source. The pipeline is expressed as Dagster software-defined assets composed by a build plan; each gate is a contract, not a step. Data does not advance to the next gate until the previous one has emitted a signed, lineage-recorded promotion event.

```
┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐
│ BRONZE · RAW + STAMPED   │    │ SILVER · CONFORMED       │    │ GOLD · ML-READY          │
│ Inviolable raw layer     │ →  │ Cleaned, normalized,     │ →  │ Released asset           │
│                          │gate│ safe                     │gate│                          │
│ 07 Acquisition & intake  │    │ 09 Cleaning & normalize  │    │ 13 QA & quality scoring  │
│ 08 Profiling             │    │ 10 PII redaction/anon.   │    │ 14 Packaging             │
│ 10 PII detection (RO)    │    │ 11 Enrichment            │    │ 15 Publication / delivery│
│                          │    │ 12 Labeling & curation   │    │                          │
│ FORMAT  As-arrived,      │    │                          │    │ FORMAT  Buyer-requested  │
│         checksum-sealed  │    │ FORMAT  Iceberg / Lance  │    │         + manifest       │
│ RIGHTS  Source contract  │    │         / WebDataset     │    │ DOC.    Card · datasheet │
│         attached         │    │ SCHEMA  Conformed        │    │         · Croissant      │
│ RETEN.  Per-license,     │    │         canonical schema │    │ SIGNED  SHA-256 + license│
│         default 7 yrs    │    │ QUALITY GE + Pandera     │    │         + lineage        │
└──────────────────────────┘    └──────────────────────────┘    └──────────────────────────┘
```

### Why medallion, specifically

Medallion architecture maps cleanly onto Caudals' commercial model: bronze corresponds to *raw supplier asset*, silver to *build work-in-progress*, and gold to *SKU*. Promotion events between layers correspond to commercial events: bronze→silver triggers the point at which the build clock starts; silver→gold triggers the QA release that unlocks billing or revenue share.

### The nine pipeline stages

| #  | Stage | Purpose | Artefacts produced |
|----|---|---|---|
| 07 | Acquisition & intake | Receive, fingerprint, register, and seal raw source material with provenance. | Bronze partition, source manifest |
| 08 | Profiling | Inspect schema, distributions, types, missingness, duplicates, drift markers. | Profile report, sketches |
| 09 | Cleaning & normalization | Standardize values, units, encodings; deduplicate; resolve malformed records. | Silver partition (clean) |
| 10 | Privacy & PII handling | Detect, mask, anonymize, pseudonymize; document residual risk. | PII map, redaction log |
| 11 | Enrichment | Add derived features, joins, taxonomies, geo-coding, embeddings. | Silver-enriched partition |
| 12 | Labeling & curation | Annotate, review, resolve disagreement; sample for active learning. | Label batches, ontology |
| 13 | QA & quality scoring | Verify against acceptance criteria; produce scorecard and exception report. | QA report, score, gate verdict |
| 14 | Packaging | Convert to buyer-requested formats; produce dataset card, datasheet, Croissant manifest. | Gold artefact + manifests |
| 15 | Publication / delivery | Sign, license-stamp, deliver via signed URL, S3 share, API or warehouse share. | Delivery receipt, acceptance evidence |

---

## 07 · Acquisition and intake

### Sealing source material with provable provenance

Acquisition is the first and most legally consequential stage. Every record entering the system is fingerprinted, attached to a contract, and sealed into the bronze layer with a provenance manifest. Once sealed, bronze data is read-only for the rest of the platform's lifetime.

### Supported intake channels

#### Pull-mode

- **Object storage shares.** S3, R2, GCS, Azure Blob via short-lived credentials.
- **Database snapshots.** Postgres, MySQL, Snowflake, BigQuery, Redshift via read-only roles or share grants.
- **API connectors.** REST/GraphQL pulls with cursor-based pagination, retries, and replay.
- **Warehouse shares.** Snowflake Secure Data Sharing, BigQuery Authorized Datasets, Databricks Delta Sharing.
- **Public scrapers.** Whitelisted domains only, robots.txt-aware, rate-limited; for enrichment, never as primary source.

#### Push-mode

- **SFTP.** Per-supplier, key-only, isolated drop zones; events on drop.
- **Signed upload URLs.** Multi-part, resumable, tied to a supplier asset registration.
- **Email-to-bucket.** For small artefacts, with verified-sender allow-listing.
- **Physical media.** Encrypted drives mailed in; ingest at our facility under audit camera.
- **Webhook.** Supplier emits change events; Caudals pulls deltas.

### The intake contract

Every intake event creates an immutable record:

```json
// supplier_intake_event — bronze write
{
  "intake_id": "in_01H8ZG...",
  "supplier_asset_id": "sa_01H8ZG...",
  "channel": "sftp",
  "received_at": "2026-05-09T11:42:18Z",
  "received_by": "caudals-ingest-svc-prod-04",
  "contract_ref": "ct_01H8...#cl=4.2",    // license clause pinned
  "jurisdiction": "EU-ES",
  "object_uri": "s3://caudals-bronze/sa/01H8ZG/2026-05-09/raw.parquet",
  "bytes": 2847113402,
  "sha256": "7c3b...b9e2",
  "signed_by_supplier": true,
  "caudals_signature": "ed25519:...",
  "chain_of_custody": ["sftp-edge-03", "intake-svc-04", "bronze-store-eu-1"]
}
```

### Required at intake (gate G-1)

1. **Provenance manifest.** Source organization, contract reference, jurisdiction, sender identity, transport channel, timestamp.
2. **Permitted-use declaration.** Structured: train, fine-tune, eval, infer commercial, infer non-commercial, redistribute. Per-record granularity if the contract requires it.
3. **Sensitivity flag.** One of: `PUBLIC` · `CONFIDENTIAL` · `PII-PRESENT` · `PHI / PCI / SPECIAL-CATEGORY`
4. **Refresh declaration.** One-shot, scheduled, on-event, or perpetual.
5. **Retention & right-to-erasure posture.** How DSARs propagate.
6. **Quarantine on suspicion.** Any of: malformed manifest, missing contract, unverifiable sender, unexpected sensitivity. Quarantine is a holding bucket with no downstream visibility.

### Operational guarantees

- **Atomicity.** Multi-part uploads commit only after manifest validation passes. No half-loaded partitions.
- **Replay.** Every intake is reproducible from its event log. Failed intakes can be re-run without contacting the supplier.
- **Audit.** Every read of bronze data is logged with caller identity, purpose, and downstream artefact ID.

---

## 08 · Profiling

### Look at the data before you commit to a build

Profiling produces a structured understanding of the source material: schema, types, distributions, cardinalities, missingness, duplication, suspected sensitive fields, and modality-specific signals (image resolution histograms, audio sample-rate distribution, document layout inventory). Every build plan is a function of its profile.

### Profile dimensions, by modality

| Modality | Core profile signals | Modality-specific signals |
|---|---|---|
| Tabular | Row count, column types, null rates, cardinality, value distributions, key uniqueness, foreign-key suggestions. | Time-of-day skew, geographic skew, outlier clusters, duplicate keys. |
| Text | Token count, language mix, length distribution, dedup rate, encoding cleanliness. | Topic clusters, toxicity prevalence, contamination overlap with public benchmarks. |
| Image | Count, resolution histogram, aspect ratio, color depth, format inventory, near-duplicates via perceptual hash. | Object-class prior (zero-shot), exposure / blur quality, embedded metadata (EXIF/GPS). |
| Video | Duration histogram, fps, codec, resolution, scene-change density. | Subject coverage, audio-track presence, captions presence, redaction need. |
| Audio | Duration, sample rate, channels, codec, SNR estimate. | Speaker count estimate, language ID, voice activity ratio. |
| Geospatial | Bounding box, CRS, feature density, temporal extent. | Resolution inconsistency, edge artefacts, sensor mix. |
| Time series | Sample rate, gap distribution, regime changes, seasonality fingerprints. | Sensor drift, calibration jumps, blackout windows. |
| Document | Page count, layout types (single/multi-column, tables, forms), language mix, OCR confidence. | Signature presence, tabular-data ratio, redaction artefacts. |

### Profile artefacts

#### Streamed sketches

whylogs profiles run inline with ingestion to produce privacy-preserving, mergeable sketches per partition. These are the production-runnable signal: they survive scale, are mergeable across time windows, and can be exposed safely without leaking row-level data.

#### Human-readable report

ydata-profiling produces a one-shot HTML report on a representative sample, attached to the build plan. This is the artefact the operator reads; the streamed sketches are what the platform reasons over.

### Profile gate (G-2)

Promotion to the cleaning stage requires:

- **Schema fingerprint** registered in the schema registry (with diff against any prior version of this asset).
- **Suspected-PII column list** reviewed by an operator (the actual redaction happens in §10).
- **Encoding/format anomalies** resolved or quarantined.
- **Volume / completeness** within the supplier's declared envelope; any >15% deviation triggers review.
- **Suitability call** — operator records whether the data is suitable for the proposed buyer brief or supplier offer; if not, the asset returns to the supplier with feedback.

### Profile-driven build planning

The profile output drives the build plan automatically: e.g., a column flagged 99.97% unique with a tax-ID-shaped pattern auto-routes to the PII recogniser pool; a column with 80% nulls auto-flags for either drop or imputation discussion; an image set with 40% near-duplicates auto-queues perceptual deduplication. The operator approves or overrides; nothing runs silently.

> "A dataset's profile is not metadata. It is the only honest statement we can make about the data before we transform it." — *Operations principle*

---

## 09 · Cleaning and normalization

### Make the data say what it means, consistently

Cleaning is the highest-leverage stage in terms of buyer-perceived quality. A buyer evaluating a sample notices encoding garbage, mixed units, inconsistent timestamps and broken joins long before they notice the labeling ontology. The cleaning stage is therefore over-invested relative to its lines-of-code share.

### Cleaning operators — the toolbox

| Class | Operator | Notes |
|---|---|---|
| Type repair | cast, parse-date, parse-numeric, parse-currency, infer-from-pattern | Rejects rows that fail with reason recorded. |
| Encoding | utf8-canonicalize, mojibake-fix, BOM-strip, line-ending-normalize | Common pre-2020 supplier exports are full of these. |
| Whitespace & case | trim, collapse, lower, title, sentence | Per-field; configurable. |
| Units | convert-currency, convert-temperature, convert-distance, normalize-time-zone | Authoritative reference tables versioned in the platform. |
| Identifiers | e164-phone, iso-country, iso-currency, iban-validate, vat-validate | Validation + canonicalization; rejection routed to repair queue. |
| Geo | geocode, reverse-geocode, h3-bin, country-from-coords | Cached against a managed local geocoder; rate-limited fallbacks. |
| Deduplication | exact-key, fuzzy-block, perceptual-hash, embedding-near-dup | Modality-aware; blocking + scoring + threshold. |
| Missing-value handling | drop, sentinel, group-mode, regression-impute, llm-fill (with caveat record) | Default is sentinel + flag; impute requires explicit operator approval. |
| Outliers | iqr-clip, zscore-clip, isolation-forest-flag | Default behaviour is to flag, not drop. |
| Schema conformance | rename, project, reorder, type-coerce-strict | Output is the canonical Caudals schema for the dataset family. |

### Image / video / audio cleaning

#### Image
Re-encode to canonical format (PNG/JPEG/WebP) at a set quality target. Strip EXIF except whitelisted fields. Resolve rotation tags. Flag corrupt frames. Perceptual deduplication via pHash + dHash.

#### Video
Re-mux to canonical container (MP4 + H.264/H.265). Normalize fps to a target if labeling demands it. Extract keyframes for previews. Flag frames with embedded burnt-in PII (timestamps, names) for §10.

#### Audio
Resample to canonical rate. Normalize loudness (EBU R128). Strip ID3 tags. Voice-activity segment for downstream label efficiency. Flag DTMF / phone-number tones.

### Cleaning gate (G-3)

1. **GE suite passes** against the silver schema with no critical failures.
2. **Pandera typed schema** validates without coercion warnings.
3. **Reject rate** within the build plan's tolerance, with rejected rows preserved in a side bucket for analysis.
4. **Sample diff** reviewed by operator: 50 random before/after pairs.
5. **Reproducibility check**: cleaning is deterministic given the same input + version-pinned operators; verified by hashing.

### Cleaning is composable, not bespoke

Each operator is a Dagster op with a typed input/output. A build plan is a YAML manifest naming operators and their parameters. The platform ships a curated library of operators; teams add new ones via the `caudals/cleaning-operators` contribution repo with mandatory unit tests, deterministic-output tests, and a profiling benchmark.

---

## 10 · Privacy and PII handling

### PII is detected at ingest, not at delivery

Privacy handling is the single most important non-functional requirement of the platform. A privacy incident is more damaging to the company than a year of missed sales targets. The architecture is designed so that PII presence is established before any silver-layer code touches the data, and so that the only PII that leaves the platform is PII a buyer's contract explicitly permits.

```
┌──────────┐   ┌──────────────────┐   ┌──────────────┐   ┌──────────┐
│ BRONZE   │ → │ PII DETECTOR     │ → │ PII MAP      │ → │ SILVER   │
│ Raw +    │   │ POOL             │   │ Per-field    │   │ Safe to  │
│ sealed.  │   │ Presidio + NER   │   │ decisions:   │   │ transform│
│          │   │ + spaCy + custom │   │ Drop · Mask  │   │          │
│ No silver│   │ + modality detr. │   │ · Hash ·     │   │ Residual │
│ code     │   │ + DP-aware       │   │ Tokenize ·   │   │ risk     │
│ touches  │   │ sketches         │   │ Synthesize   │   │ documented│
│ bronze.  │   │                  │   │ Operator OKs │   │          │
└──────────┘   └──────────────────┘   └──────────────┘   └──────────┘
```

### Detection

Detection is multi-layered:

- **Pattern recognisers** (Presidio): emails, phones, IBANs, passports, credit cards, SSNs, national IDs (per jurisdiction), MRNs, license plates.
- **NER models** (spaCy / transformers): person names, organizations, locations, with confidence scoring.
- **Custom recognisers**: per-supplier patterns (employee ID schemas, internal IDs that act as quasi-identifiers).
- **Modality detectors**: face detection (image/video), license-plate detection (image/video), voice biometrics (audio), embedded text in images (OCR + recogniser).
- **Quasi-identifier risk model**: flags column combinations whose joint distribution allows re-identification (k-anonymity < 5 over expected adversary's external data).

### Treatment palette

| Treatment | What it does | When to use |
|---|---|---|
| Drop | Remove the field entirely. | Field offers no buyer value. |
| Mask | Replace with a sentinel (`[REDACTED]`). | Field exists for structure; content is sensitive. |
| Hash | Keyed cryptographic hash with a per-build pepper. | Joining is needed but identity is not. |
| Tokenize | Reversible token in a vault Caudals controls. | Reversibility is required for legal hold; never delivered. |
| Pseudonymize | Stable opaque ID per entity within the dataset. | Entity coherence required without identity. |
| Generalize | Bin to coarser bucket (age → band, ZIP → region). | Useful resolution preserved; reduces re-id risk. |
| Synthesize | Replace with statistically plausible synthetic values. | Tabular release where format must be preserved. |
| DP-noise | Differentially-private aggregates only. | Aggregate datasets for high-sensitivity domains. |
| Blur / pixelate | Image / video masking of faces, plates, screens. | CV datasets where context matters but identity does not. |
| Voice swap | Replace speaker identity while preserving prosody. | Audio datasets requiring speaker non-identifiability. |

### Privacy gate (G-4)

1. **PII map** reviewed and signed off by the operator and (for special categories) the privacy lead.
2. **Coverage report** proves treatment was applied to every flagged location.
3. **Residual-risk note** documents any acknowledged exposure and its commercial justification.
4. **Reverse map** (token vault, hash pepper) is stored separately, encrypted, with KMS-controlled access.
5. **DPIA reference** attached if special-category data is handled.

---

## 11 · Enrichment

### Add value carefully. Most records do not need it.

Enrichment is the most over-applied stage in industry data pipelines. Caudals enriches only when the buyer's brief or the catalogue strategy requires it, and never silently. Every enrichment must declare its source, its license, and the columns it adds; downstream consumers can opt out at delivery.

### Enrichment classes

| Class | Examples | License posture |
|---|---|---|
| Reference data | Country / region taxonomies, ISO codes, currency conversion, calendar/holidays. | Caudals-licensed reference tables; permissively redistributable in derivatives. |
| Geospatial | Reverse geocoding, H3 indexing, administrative-boundary joins, weather context. | Mixed; weather/admin is OSM/governmental open; commercial sources flagged separately. |
| Categorical | Industry codes (NAICS/SIC/NACE), product taxonomies, MeSH/UMLS for medical. | Each taxonomy versioned and license-tracked. |
| Derived features | Statistical features (rolling means, deltas), time-bucketed summaries. | Inherits from underlying data. |
| Embeddings | Sentence / image / audio embeddings for downstream ML use. | Tracked with model identity, version, and any model-license restrictions. |
| LLM-derived | Summaries, classifications, structured extractions. | Treated as *derived*: the model used is recorded; its license propagates to the derivative. |
| External joins | Public records, sanctions, OFAC/PEP, third-party paid data. | External-data licenses tracked per row if needed. |

### LLM-as-enrichment, with caution

LLM-generated enrichments (summarization, structured extraction, classification) are useful but legally non-trivial. The platform records:

- **Model identity and version** — a hash, not a brand name.
- **Prompt template version** — tracked in a prompt registry.
- **Decoder settings** (temperature, max tokens) for reproducibility.
- **Confidence signal** if available (logprobs, self-rating).
- **Spot-check rate** — mandatory human sample of LLM output.
- **Cost ledger** per build for budget control.

### Enrichment gate (G-5)

1. **Enrichment manifest** declares every added column with source, license, version, and computation method.
2. **Spot-check pass**: human review on a stratified sample, with disagreement rate below the build's threshold.
3. **Independence test**: enrichment columns are derivable purely from the silver layer; no information leaks from gold-only sources.
4. **License compatibility**: every enrichment's license is compatible with the dataset's intended buyer-side use.

> "If the enrichment cannot be reproduced from a manifest, it is not an enrichment — it is folklore. Folklore does not ship."

---

## 12 · Labeling, curation & active learning

### Three strategies, one review fabric

Caudals does not pick a labeling philosophy. It supports human-in-the-loop annotation, programmatic / weak-supervision labeling, and active learning in one fabric, because real production datasets need all three. The review and quality-control layer is shared; the production strategies differ.

### Three production strategies

#### A · Human in the loop — Annotation by trained reviewers
Multi-pass annotation in Label Studio / CVAT with reviewer queues, gold-question seeding, agreement scoring, adjudication. Used when ground truth requires expert judgement (medical, legal, regulated industries) or when programmatic strategies cannot meet the quality bar.

#### B · Programmatic / weak — Labeling functions + label model
Snorkel-style: heuristics, regex, ontology-rule hits and small classifiers vote on each record; a label model resolves conflicts. Used for high-volume text and tabular labeling, often as a first pass to feed reviewer queues. LLM-as-labeler is implemented as a labeling function with its model/prompt logged.

#### C · Active learning — Loop with model uncertainty
An assistant model is trained on early labels; its predictions inform sampling: high-uncertainty + diverse-embedding + boundary samples are routed to reviewers next. Reduces the labels needed to reach a quality target by 3–10× on most CV / NLP tasks at our scale.

### Ontology & schema control

Each labeling project owns an **ontology**: the structured definition of classes, attributes, relations, and per-class instructions. The ontology is versioned in the platform; changing it during a build requires a documented migration of in-flight labels.

- **Class definitions.** Name, definition, positive/negative examples, edge-case notes.
- **Hierarchies.** Parent-child relations and inheritance.
- **Attributes.** Per-class attribute schemas (e.g., bounding box + occlusion + truncation flags).
- **Relations.** Cross-instance relations (e.g., "is part of", "located at").
- **Conflict rules.** Which class wins when annotators disagree.

### Reviewer queue & quality control

| Mechanism | What it does |
|---|---|
| Gold questions | Pre-labeled items inserted into reviewer queues; deviation triggers review of the reviewer. |
| Multi-pass with adjudication | Two or three independent labels per item; disagreements routed to a senior adjudicator. |
| Agreement metrics | Cohen's kappa / Krippendorff's alpha / IoU per class; tracked over time. |
| Confidence-aware routing | Low-confidence items get more reviewers; high-confidence items skip review when programmatic source agrees with one human pass. |
| Reviewer cohorts | Each reviewer has skill profiles; queue routes by skill match. |
| Time tracking | Per-item time recorded; outliers (too fast, too slow) sampled for review. |
| Cleanlab pass | Confident-learning scan finds suspected label errors after first pass; requeues them. |

### Workforce composition

Three reviewer pools are supported:

- **In-house specialists.** Caudals staff handling sensitive / regulated / expert-judgement work.
- **Vetted partner workforce.** Contracted reviewers via partner labeling firms with NDAs and quality SLAs; managed entirely through Caudals' own UI to prevent data sprawl.
- **Subject-matter experts.** Doctors, lawyers, mechanics, engineers contracted per-project for adjudication.

#### Data isolation

Data never leaves Caudals' VPC. Reviewers connect to a hardened web UI; download is disabled, screen-region restriction enforced for sensitive datasets, watermarking applied, and review activity is fully audit-logged. Special-category data is reviewed only by background-checked staff in a policy-restricted environment (no clipboard, no screenshot, no outbound network).

### Labeling workflow — the canonical flow

```
SAMPLE  →  PRE-LABEL  →  REVIEW    →  ADJUDICATE  →  SCAN & REQUEUE
Active     Programmatic  Human         Disagreements  Cleanlab errors
selection  + assistant   pass(es)      to seniors     + drift
+ random   model         + gold checks                detection
+ edge

   ▲                                                            │
   └────────────── ACTIVE-LEARNING LOOP ───────────────────────┘
```

### Labeling gate (G-6)

1. **Coverage**: every silver record either labeled, deferred with reason, or excluded with reason.
2. **Inter-annotator agreement**: Krippendorff's alpha ≥ threshold per class; failing classes block release.
3. **Gold accuracy**: reviewer accuracy on gold questions ≥ threshold; below threshold returns to retraining.
4. **Cleanlab error rate**: estimated label-error rate ≤ threshold after final pass.
5. **Class distribution**: matches the build plan's intended distribution within tolerance, or rebalancing is documented.

### Review UI requirements

- Modality-aware widgets (bounding box, polygon, mask, keypoint, audio segment, text span, document field).
- Side-by-side compare with prior pass; reviewer history visible.
- Keyboard-first interaction: a senior reviewer should never reach for a mouse.
- Hot-keys per ontology class are configurable.
- Inline ontology reference; no separate document.
- Disagreement view: visual overlay of all annotators on the same item.
- Confidence overlays from the assistant model.
- Audit trail per item: who, when, how long, what changed.
- Bulk actions with confirmation and reversibility.
- Network-loss-tolerant: reviewer never loses work to a flaky connection.

---

## 13 · QA and quality scoring

### A scorecard the buyer trusts before they pay

The QA stage produces three artefacts: an accept/reject verdict against the build plan's acceptance criteria, a public-facing quality scorecard that the buyer sees at sample preview, and a structured exception report used internally to decide release vs. rework.

### Quality dimensions

| Dimension | Definition | Measured by |
|---|---|---|
| Completeness | Required fields present and non-null at expected rates. | GE suite, profile delta vs. plan. |
| Validity | Values match declared types, ranges, and reference vocabularies. | Pandera schema, validator suites. |
| Consistency | Cross-field relationships hold (e.g., country in address matches phone). | Custom rules, GE compound expectations. |
| Uniqueness | Declared keys are unique; near-duplicates are below tolerance. | Hash + perceptual / embedding scans. |
| Timeliness | Records are within the freshness window declared on the listing. | Date column statistics, drift detector. |
| Accuracy | Labels match held-out gold within tolerance. | Gold-set evaluation, agreement metrics. |
| Representativeness | Distribution matches the declared population (geography, time, class balance). | Stratified statistics vs. plan. |
| Privacy | No PII present beyond the declared posture; reverse-id risk < threshold. | PII scanner re-run on gold; k-anonymity check. |
| Provenance | Every record traces to a permitted-use clause. | Lineage join over license vault. |
| Reproducibility | Build can be re-run from manifest with identical hash. | Replay test in CI before release. |

### The composite quality score

Each dimension produces a normalized score in `[0,1]`. The composite Q-score is a weighted geometric mean (so a single zero-rated dimension cannot be hidden by strong others). Weights are set per dataset family and locked at build start. The Q-score is exposed publicly on the catalogue listing alongside its component breakdown.

```json
// quality_scorecard sample
{
  "dataset_version_id": "dv_01H8ZG...",
  "composite": 0.91,
  "dimensions": {
    "completeness":     0.99,
    "validity":         0.98,
    "consistency":      0.94,
    "uniqueness":       0.97,
    "timeliness":       0.88,
    "accuracy":         0.86,    // label-vs-gold
    "representativeness":0.82,
    "privacy":          1.00,
    "provenance":       1.00,
    "reproducibility":  1.00
  },
  "verdict": "release",
  "exceptions": [
    {"code":"REPR_GEO_SKEW", "detail":"DE under-represented vs plan by 7%"}
  ]
}
```

### Bias & fairness checks

For datasets feeding regulated AI systems, an additional bias panel runs: representational balance across declared protected attributes (where present and lawful), label distribution fairness, and (where the buyer brief calls for it) a downstream-model bias probe trained on a fraction of the data.

### Acceptance evidence

Every release produces an *acceptance evidence* bundle: the scorecard, the exception report, the lineage manifest, the licensing summary, and a sample preview. This bundle is what the buyer signs against on delivery and what auditors look at later. It is immutable.

---

## 14 · Packaging and format generation

### One canonical asset, many packaged forms

A released dataset has a single canonical representation in the lakehouse and a set of packaged deliverables generated on demand for the formats and frameworks each buyer requires. Packaging is a deterministic transformation of the canonical asset; it never alters semantics, only encoding.

### Canonical representation

For each modality, Caudals chooses one canonical lakehouse format:

| Modality | Canonical | Why |
|---|---|---|
| Tabular | Iceberg + Parquet (zstd) | Ubiquitous, columnar, partition-pruned, vendor-neutral. |
| Text | Parquet (text + metadata) + JSONL mirror | Parquet for engines; JSONL for tokeniser pipelines. |
| Image | Lance dataset + media references | Random access for training; references resolve to S3 objects. |
| Video | Lance index over MP4 chunks + frame manifests | Streamable in training pipelines. |
| Audio | Lance index over WAV/FLAC + segment manifests | Per-segment labels join cleanly. |
| Geospatial | STAC catalog + GeoParquet + Cloud-Optimised GeoTIFF | Industry-standard interchange. |
| Time series | Iceberg / Parquet partitioned by time + entity | Time travel and partition pruning. |
| Document | Parquet (page-level structured) + original-PDF references | Both layout-aware features and original retained. |

### Packaging targets — the export matrix

| Target | Use | Notes |
|---|---|---|
| Parquet (zip) | Universal tabular delivery. | Default for warehouse / Spark / Polars consumers. |
| CSV | Legacy / spreadsheet consumers. | Strict UTF-8, RFC-4180; per-column type sidecar. |
| JSON / JSONL | NLP and document pipelines. | One record per line; canonical key order. |
| COCO JSON | CV detection / segmentation. | Image references + annotations; ontology-mapped. |
| YOLO txt | YOLO-family training. | Class index file + per-image annotations. |
| TFRecord | TensorFlow training. | Sharded; manifest of shards. |
| WebDataset | PyTorch streaming. | Sharded tar; lossless mapping from canonical Lance. |
| HF Datasets | Hugging Face consumers. | Includes Croissant manifest. |
| Delta Sharing / Snowflake | Warehouse-native delivery. | For buyers who never want to download. |
| REST / gRPC API | Streaming consumption. | Per-record paged with cursors. |

### Required documentation, packaged with every release

1. **Dataset card.** Hugging Face style: purpose, sources, structure, splits, considerations, limitations.
2. **Datasheet.** Gebru et al. style: motivation, composition, collection, preprocessing, uses.
3. **Croissant manifest.** Machine-readable JSON-LD for ML toolchains.
4. **Schema & data dictionary.** Per-column types, descriptions, value ranges, references.
5. **Quality scorecard.** The artefact from §13.
6. **Lineage / provenance summary.** Source, contracts, transformations, tool versions, run hashes.
7. **License & permitted-use summary.** Plain-language plus structured permissions.
8. **Privacy summary.** PII handling posture, residual risk, DSAR procedure.
9. **Refresh policy.** Cadence, expected drift, deprecation policy.
10. **Sample preview.** 100 representative records or 30 representative items per modality.

### Packaging gate (G-7)

Every packaged artefact must:

- Round-trip back to the canonical with identical content hashes (lossless transformation).
- Carry a `manifest.json` at the package root with version, build hash, signing key, and embedded Croissant.
- Include all ten required documents above.
- Pass an automated consumer test that loads the package in its native framework (e.g., `datasets.load_dataset(...)` for HF) and validates record count + schema.

---

## 15 · Publication and delivery

### Hand-off the buyer can verify, audit later

Delivery is the moment the platform's promises become contractual. Caudals' delivery posture treats the buyer's first 24 hours with the artefact as the most important hour of the engagement: the artefact must load, the documentation must be coherent, and the acceptance evidence must be machine-verifiable.

### Delivery channels

| Channel | Use | Notes |
|---|---|---|
| Signed download URL | Default for one-shot delivery. | Time-limited; per-buyer; multi-part for > 5 GB; resumable. |
| Buyer-side S3 bucket | Buyer provides write target. | Cross-account role-assumption; encrypted in transit. |
| Caudals S3 read share | Buyer reads from Caudals' bucket. | Per-buyer prefix; access keys rotated per delivery. |
| Snowflake / Delta share | Warehouse-native consumption. | Provider-managed; per-share license enforced. |
| REST / gRPC API | Streaming or query-based. | Rate-limited per contract tier. |
| Physical encrypted media | Air-gapped buyers. | Logged, signed, returned for destruction. |
| Hugging Face mirror | Public catalogue listings only. | Caudals-managed namespace; license-stamped. |

### Catalogue listing vs. private offer

#### Catalogue listing
Public (or buyer-base-only) listing in the marketplace catalogue. Standard licensing tiers, public quality scorecard, sample preview, list price, refresh cadence. Future surface; ships after the catalogue schema and listing UI are released (see §30).

#### Private offer
Single-buyer or small-group offer. Customized license, exclusivity window, custom delivery cadence, NDA-gated sample preview. Default delivery mode through year one.

### Acceptance & receipt

1. **Pre-delivery checksum.** Caudals signs the package; buyer verifies signature with Caudals' published key.
2. **Delivery event.** Buyer download / share grant emits a delivery event; the receipt is timestamped and hashed.
3. **Acceptance window.** Buyer has a contracted window (typically 7 days) to raise issues against the QA scorecard.
4. **Acceptance signature.** Buyer countersigns the receipt; the asset is now *accepted*; commercial events trigger.
5. **Audit retention.** Receipt + scorecard + lineage manifest are retained per the contract's audit term (default 7 years).

### Refresh & subscription delivery

Subscription deliveries (recurring data feeds) ship as *increments*: each refresh produces a new dataset version with a delta manifest pointing to the previous version. Buyers consume either the latest version or a rolling window. Each increment carries its own quality scorecard and privacy verification — rights are not assumed to be inherited.

### Right-to-be-forgotten propagation

When a supplier or upstream subject exercises a deletion right, the platform must propagate deletion to all derivative dataset versions still under retention. The propagation runs as a tracked job: every affected dataset version is rebuilt or marked *tombstoned*; buyers consuming subscription deliveries receive a deletion-required notice with an actionable manifest of affected records. This is a hard requirement of operating in EU / CA / regulated jurisdictions.

---

## 16 · Versioning, lineage and provenance

### Every dataset version knows where it came from

Lineage is the platform's connective tissue. It is what allows Caudals to defend dataset provenance to a buyer's procurement team, comply with a supplier's revocation, propagate a deletion request through derivatives, and rebuild any historical asset on demand. The lineage layer is non-optional and runs platform-wide.

### Three nested versioning systems

| System | What it versions | Granularity |
|---|---|---|
| Git | Pipeline code, build plans, ontologies, prompts, configs. | Per commit; hash is the identity. |
| lakeFS | Bronze, silver, gold partitions on object store. | Per commit on per-asset branches; petabyte-safe. |
| Iceberg / Lance time-travel | Table-level snapshots within a lakeFS commit. | Per snapshot id; cheap point-in-time queries. |

### The lineage event spec

Every transformation emits an OpenLineage-compliant event:

```json
// OpenLineage RunEvent (abbreviated)
{
  "eventType": "COMPLETE",
  "eventTime": "2026-05-09T13:42:18Z",
  "run": { "runId": "r_01H8ZG...", "facets": { "caudals_build": { "buildId": "bd_01H8..." } } },
  "job": { "namespace": "caudals.ops", "name": "clean_normalize.v3",
           "facets": { "sourceCode": { "gitSha": "a8f3..." } } },
  "inputs":  [ { "namespace":"caudals.bronze", "name":"sa/01H8ZG/2026-05-09",
                 "facets":{ "version":{ "datasetVersion":"lakeFS:b3c1@8a91"}}} ],
  "outputs": [ { "namespace":"caudals.silver", "name":"ds/01H8ZG/clean",
                 "facets":{ "schema":{ "fields":[ ... ] },
                            "dataQualityAssertions": [ ... ],
                            "caudals_license":{ "contractRef":"ct_01H8...#cl=4.2" } } } ]
}
```

### The lineage graph

Events flow into Marquez (or an equivalent backend), producing a navigable graph of:

- **Datasets** — bronze, silver, gold partitions across versions.
- **Jobs** — pipeline operators with code SHA and parameters.
- **Runs** — specific executions with start/stop, status, metrics, logs.
- **Facets** — schema, quality assertions, license clauses, PII map references, model identifiers.

### Provenance proofs

1. **Build manifest.** A YAML at the root of every gold release naming sources, transforms, parameters, code SHAs, model versions, and producing hash.
2. **Replay test.** CI re-runs a representative sample of the manifest in a clean environment and asserts hash equality.
3. **Sign-off.** Operators sign release manifests; signatures are stored alongside the asset.
4. **External attestation** (optional, regulated buyers): notarised hashes published to a transparency log.
5. **C2PA stamp** (image/video/audio): content credentials embedded for AI-trained media artefacts.

### Time-travel queries

Operators and auditors can query *"what did this dataset look like on date X"* via Iceberg / Lance snapshot reads, joined to the lineage graph. The platform exposes a `caudals lineage trace <asset_id>` CLI and a UI surface in the admin console.

---

## 17 · Build-from-existing-data — the derivation engine

### Datasets compose. The catalogue is its own raw material.

A core capability of Caudals is building new datasets from existing ones — combining, slicing, filtering, augmenting, mixing, or re-labelling assets the platform already owns. The derivation engine treats this as a first-class build, with a stronger licensing engine because every input asset's permitted-uses must compose into the new output's permitted-uses.

### Derivation operators

| Class | Operator | Notes |
|---|---|---|
| Slice | filter, stratify, sample, time-window, geo-window | Always recorded; never silent. |
| Combine | union, join, multimodal-pair | Schema reconciliation is explicit, not inferred. |
| Re-label | ontology-remap, hierarchical-collapse, expert-relabel | Original labels preserved as a hidden facet. |
| Augment | augmentation pipeline (image/audio/text), counterfactual generation | Augmentations marked; downstream consumers can opt out. |
| Synthesize | SDV / Gretel synthetic from real, with utility-vs-privacy report | Synthetic provenance is explicit; never blended with real silently. |
| Decontaminate | n-gram + embedding overlap removal vs. eval benches. | Required for LLM-training derivatives. |
| Curate | quality-score gating, deduplication, hard-negative mining. | Drives buyer-specific evaluation sets. |

### License composition algebra

Each input's license is a structured object with permissions and restrictions (training, fine-tuning, eval, commercial inference, redistribution, exclusivity, geographic, term, share-alike). The derivation engine computes the intersection of these permissions for the output. If the intersection is empty for the buyer's intended use, the build is blocked at planning time, not at delivery.

```python
# composed permitted-use computed at plan time
inputs: [
  ds_A.permits = {train:true, commercial_inference:true,  redistribute:false, geo:"WW"},
  ds_B.permits = {train:true, commercial_inference:false, redistribute:false, geo:"EU"}
]
output.permits = intersect(inputs.permits)
              = {train:true, commercial_inference:false, redistribute:false, geo:"EU"}

# buyer brief asks for commercial-inference + WW — build PLAN BLOCKED
```

### Common derivation recipes

- **Domain corpus**: union of N text sources, deduplicated, decontaminated against eval benches.
- **Eval set**: stratified sample from a held-out partition, expert re-labelled, never trained on.
- **Hard-negative pool**: assistant-model errors mined and re-routed for review.
- **Multilingual variant**: same content in additional languages via translation pipeline + human review.
- **Synthetic-augmented training**: real seed + synthetic augmentation in a documented mix ratio.
- **Vertical slice**: single industry / geography / time-window cut from a broader catalogue asset.
- **Multi-modal pair**: image+caption, audio+transcript, document+structured-fields built from aligned sources.

### Reusable build templates

Recurring derivations are saved as *build templates*: parameterised YAML manifests that operators can instantiate per buyer brief. Templates make pricing predictable and execution fast. The first templates Caudals ships are: `eval-set-build`, `domain-corpus-build`, `vertical-slice-build`, `multi-supplier-merge`, `synthetic-augmented-build`.

---

## 18 · Multi-modality — eight first-class types

### One platform. Eight ways to be a dataset.

The orchestration, lineage, license and audit layers are modality-agnostic (Principle P-07). Each modality plugs in via a contract that defines its canonical representation, profile signals, cleaning operators, privacy treatments, labeling widgets, QA dimensions and packaging targets. New modalities can be added by implementing this contract; nothing in the core changes.

#### 01 · Tabular
**Use cases.** Predictive modelling, fraud, churn, logistics, finance.
**Canonical.** Iceberg+Parquet.
**Tooling.** Polars / DuckDB / Spark.
**Special concerns.** Foreign-key consistency, time-leakage controls, quasi-identifier risk.
**Packaging.** Parquet, CSV, Snowflake share, REST API.

#### 02 · Text
**Use cases.** LLM pre-training, fine-tuning, RAG corpora, classification, NER.
**Canonical.** Parquet+JSONL mirror.
**Tooling.** spaCy, HF Datasets, Argilla, Tiktoken.
**Special concerns.** Language detection, contamination vs. eval benches, toxicity audit, copyright posture.
**Packaging.** JSONL, HF Datasets, parquet shards.

#### 03 · Image
**Use cases.** Detection, segmentation, classification, generative training, OCR, retrieval.
**Canonical.** Lance with media references.
**Tooling.** FiftyOne, Albumentations, Roboflow exports.
**Special concerns.** EXIF/GPS stripping, face/plate redaction, perceptual deduplication, copyright/style inheritance for generative training.
**Packaging.** COCO, YOLO, Lance, WebDataset.

#### 04 · Video
**Use cases.** Action recognition, surveillance, autonomous systems, generative video.
**Canonical.** Lance index over MP4 chunks.
**Tooling.** CVAT, Encord-style temporal review, FFmpeg.
**Special concerns.** Temporal dedup, shot-change-aware sampling, burnt-in PII, ID3/audio metadata, keyframe vs. dense annotation policies.
**Packaging.** Per-clip MP4 + per-frame manifest, COCO video.

#### 05 · Audio
**Use cases.** ASR, speaker ID, audio events, music labelling.
**Canonical.** WAV/FLAC + Lance index + segment manifests.
**Tooling.** Label Studio audio, pyannote, Whisper for pre-label.
**Special concerns.** Voice biometrics as PII, speaker consent, prosody preservation under anonymisation.
**Packaging.** WAV/FLAC + JSONL labels, HF Audio.

#### 06 · Geospatial
**Use cases.** Climate, agriculture, logistics, urban analytics, defence.
**Canonical.** STAC + GeoParquet + Cloud-Optimised GeoTIFF.
**Tooling.** GeoPandas, TorchGeo, Kepler.gl.
**Special concerns.** CRS reconciliation, sensor calibration drift, sovereign data restrictions, embargoes by jurisdiction.
**Packaging.** STAC catalogue, GeoParquet, COG, MVT tiles.

#### 07 · Time series
**Use cases.** Forecasting, anomaly detection, industrial, finance.
**Canonical.** Iceberg / Parquet partitioned by time + entity.
**Tooling.** TimescaleDB, tsfresh, sktime.
**Special concerns.** Sample-rate alignment, gap policies, seasonality fingerprinting, sensor drift, proper train/val/test temporal splits.
**Packaging.** Parquet partitioned, Arrow IPC, REST cursor API.

#### 08 · Document
**Use cases.** KYC, contracts, invoices, medical records, claims, due diligence.
**Canonical.** Parquet (page-level structured) + original PDF references.
**Tooling.** Unstructured, LlamaParse, Textract, layout-LM family.
**Special concerns.** Layout fidelity, hand-written vs. printed, signature redaction, multi-page coherence, language mix.
**Packaging.** Parquet+PDF bundles, JSONL, REST query API.

### Cross-modal datasets

Many of the highest-value datasets are cross-modal: image + caption, document + structured fields, video + transcript, sensor + outcome. Cross-modal datasets are modeled as *aligned partitions* with a shared key column and modality-specific physical layouts. The platform exposes a `multimodal-pair` derivation operator that produces aligned packages.

---

# Part III · Product Surfaces

Four sections describing how the platform is exposed to the four populations who interact with it: operators, buyers, suppliers, and the public. Operators come first; everything else descends from the operations console.

- 19 — Operator console
- 20 — Buyer workspace
- 21 — Supplier portal
- 22 — Public funnel

---

## 19 · Internal admin / operator console

### The operations control room

The internal console is the operator-facing surface and the most feature-dense product the platform ships in year one. It exposes every record needed to qualify, build, audit, ship, and bill datasets. It is information-dense by design and built for keyboard-first power users.

### Console module map

| Module | What operators do here | Anchor records |
|---|---|---|
| Pipeline / Home | Triage queue across all sides; today's blockers; overdue gates; release calendar. | Cross-domain index. |
| Leads & Opportunities | Inbound buyer/supplier pipeline; qualification; scoping; stage transitions. | `buyer_opportunity`, `supplier_opportunity`. |
| Suppliers | Organizations, contacts, contracts, asset registry, rights vault. | `supplier_organization`, `supplier_asset`. |
| Buyers | Organizations, contacts, briefs, sample-review history, contracts, deliveries. | `buyer_organization`, `dataset_brief`. |
| Builds | Active builds; gate status; QA readouts; rebuild & replay tools. | `build`, `run`, `gate`. |
| Datasets | Catalogue of dataset families and their versions; lineage browser; sample preview. | `dataset`, `dataset_version`. |
| Labeling | Project list; reviewer roster; queue depths; agreement metrics. | `labeling_project`, `label_batch`. |
| Quality | QA reports, scorecards, exception log, bias panels. | `qa_report`. |
| Privacy & Rights | License vault, consent registry, DSAR queue, retention schedules. | `license_clause`, `consent_record`. |
| Catalogue & Offers | Listing copy, pricing, refresh cadence, exclusivity windows, sample-preview gating. | `catalogue_listing`, `private_offer`. |
| Commercials | Quotes, contracts, invoices, supplier payouts via Stripe Connect. | `quote`, `contract`, `invoice`, `payout`. |
| Operations | Job queue, GPU utilisation, cost ledger, alerts, runbooks. | `run`, `alert`. |
| Audit | Cross-domain audit log search; export for regulators / buyers. | `audit_event`. |
| Settings | Roles, permissions, integrations, signing keys, locale, environment toggles. | `operator_role`, `integration`. |

### Power-user behaviours

- **Command palette** (⌘K): jump to any record by ID, asset name, or contract number; trigger common actions.
- **Saved views**: each module exposes named filters owned by the operator or shared with the team.
- **Bulk actions**: with explicit row-count confirmation; reversible where practical.
- **Inline editing** with optimistic UI and conflict detection.
- **Keyboard navigation** across grids; one-character shortcuts for stage transitions.
- **Audit overlays**: every record exposes who/when/what for any change, inline.

### Layout principles (DESIGN.md)

The console follows the existing Caudals design system: white panels on light gray canvas, subtle borders, restrained shadows, emerald accent for actionable states, monospace for technical identifiers. Density is high but readable; the design must remain comprehensible under time pressure during release windows or supplier escalations.

### Reference layout — "Build" detail

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ CAUDALS · OPS CONSOLE                                build/bd_01H8ZG…  · rev 12│
├──────┬─────────────────────────────────────────────────────────────────────────┤
│ NAV  │ Build · Iberian retail receipts · v3                                    │
│ Home │ brief br_01H8 · supplier so_77 · ETA 21 May                             │
│ Leads│ [SILVER]  [QA PENDING]  [PII REVIEWED]                                  │
│ Sup. │                                                                         │
│ Buy. │ PIPELINE GATES                                                          │
│►Build│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐                     │
│ Data │ │ G-1  │ G-2  │ G-3  │ G-4  │ G-5  │ G-6  │ G-7  │                     │
│ Label│ │INTAKE│PROFIL│CLEAN │PRIVCY│ENRICH│LABEL │ QA   │                     │
│ Qual.│ │ PASS │ PASS │ PASS │ PASS │ PASS │ PASS │REVIEW│                     │
│ Priv.│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┘                     │
│ Cat. │                                                                         │
│ Comm.│ ┌─────────────────────┐  ┌─────────────────────────┐                   │
│ Ops  │ │ QA SCORECARD · PROV │  │ LINEAGE · THIS VERSION  │                   │
│ Audit│ │   0.91   composite  │  │ bronze/sa_77/2026-05-04 │                   │
│      │ │ Compl 0.99  Acc 0.86│  │  → clean_normalize.v3   │                   │
│      │ │ Valid 0.98  Repr 0.82│  │  → pii_redact.v2        │                   │
│      │ │ Cons. 0.94  Uniq 0.97│  │  → enrich_iso_admin.v1  │                   │
│      │ │ Priv  1.00  Time 0.88│  │  → label_extract_li.v4  │                   │
│      │ │ Prov  1.00  Repr 1.00│  │  → qa_score.v2          │                   │
│      │ │ [RELEASE] [REWORK]   │  │ CONTRACT ct_03 · 4.2,4.5│                   │
│      │ └─────────────────────┘  │ PERMITS train · com.inf │                   │
│      │                          │   · geo EU              │                   │
│      │                          └─────────────────────────┘                   │
└──────┴─────────────────────────────────────────────────────────────────────────┘
```

---

## 20 · Buyer workspace

### A surface buyers actually want to log into

The buyer workspace ships after operator workflows are reliable. It is the AI / ML team's window into their account: their datasets, their deliveries, their quality reports, their licenses, their refresh pipelines, and their support history. It must feel native to a buyer's other infrastructure tools (Snowflake, Databricks, MLflow), not like a marketplace storefront.

### Module map

| Module | What buyers do here |
|---|---|
| Catalogue browse | Filter the public / partner-only catalogue by modality, industry, geography, freshness, license posture, price band. |
| Dataset detail | Sample preview, schema, scorecard, datasheet, license summary, provenance summary, refresh policy, sample loader code (Python / SQL). |
| Brief intake | Submit a custom build brief: use case, modality, schema needs, volume, freshness, geography, sensitivity, target formats, target frameworks, budget, deadline. |
| Builds & deliveries | Per-engagement view: status, gate progress, sample previews, scorecards, quotes, contracts, deliveries, acceptance windows. |
| Subscriptions | Active recurring deliveries; refresh history; deltas; upcoming refreshes; pause / resume. |
| Licenses | Permitted-use summary across all owned datasets; geographic and channel constraints; expirations. |
| Integrations | S3 cross-account roles, Snowflake / Databricks share targets, signed-URL preferences, webhook receivers. |
| Team & access | Org members, roles, SSO, SCIM, audit log of buyer-side actions. |
| Billing | Invoices, payment methods, spend by engagement, budget alerts. |
| Support & messages | Threaded conversations with the assigned Caudals operator on each engagement. |

### Trust primitives in the buyer UI

Every dataset surface a buyer sees displays:

- **Quality scorecard chip** with composite score and dimension breakdown on hover.
- **License chip** with permitted-use icons (train, fine-tune, eval, commercial inference, redistribute) and geography.
- **Privacy chip** indicating PII posture (none, masked, anonymised with residual-risk note).
- **Provenance chip** with source-organization count and contract status.
- **Freshness chip** with last-refresh date and cadence.

### Sample preview behaviour

Sample previews are watermarked, log every view, and are gated on a per-buyer NDA acknowledgment for non-public catalogue listings. Buyers can request access to a fuller preview through the workspace; operators approve or deny in the console.

### Code snippets, on every dataset page

Each dataset page exposes ready-to-run code snippets for: Python (Polars / Pandas / HF Datasets), SQL (Snowflake / Databricks share), PyTorch (WebDataset), and a CLI download command. Buyers should be one click away from a working pipeline.

---

## 21 · Supplier portal

### A side built for non-data-vendors

Most suppliers are not data vendors. They are operationally rich companies (logistics, retail, healthcare, agriculture, manufacturing) who own valuable data but have never sold it. The supplier portal must feel low-friction, legally reassuring, and operationally simple. It is not a self-serve listing publisher; it is a managed onboarding surface.

### Module map

| Module | What suppliers do here |
|---|---|
| Onboarding | Org profile, KYC, signing authority, primary contact, jurisdiction. |
| Asset registry | Declare data assets: name, modality, volume, schema sketch, refresh, sensitivity, intended availability (private / catalogue). |
| Rights & consent | Provide and version the legal posture per asset: ownership, end-user consent, third-party content, AI-training rights, derivative rights, geography, exclusivity tolerance. |
| Sample upload | Submit a representative sample for Caudals' feasibility pass; signed upload URLs, multi-part, resumable. |
| Build participation | Track Caudals' progress on each engagement against this supplier; respond to clarification requests; approve schema decisions; sign off on the released dataset version. |
| Catalogue presence | (when activated) approve or block individual catalogue listings derived from supplier assets. |
| Revenue share | Earnings, payouts, contract terms; Stripe Connect-backed. |
| Refresh program | For recurring deliveries: schedule, change-management, deprecation notice. |
| Compliance & DSARs | Process incoming subject-rights requests; trigger propagation into Caudals' derivative datasets. |

### Onboarding flow

1. **Expression of interest.** Public contact form / direct sales.
2. **Qualification call.** Caudals operator assesses fit; opens a `supplier_organization` record.
3. **NDA & intake agreement.** Boilerplate but jurisdiction-aware; signed in-portal via e-sign.
4. **Asset declaration.** Supplier declares one or more candidate assets with structured rights metadata.
5. **Sample submission.** A small representative sample is uploaded and ingested under feasibility licence.
6. **Feasibility memo.** Caudals returns a memo with target schema, risk register, build plan, cost range, and go/no-go.
7. **Pilot or full build.** If green, Caudals scopes a pilot (typically) before a complete build, with the rights and revenue-share terms locked.

### What suppliers should never have to do

- Build their own anonymisation pipeline.
- Negotiate AI-training-license language with each buyer.
- Operate buyer support, payments, or refund handling.
- Maintain dataset packaging in COCO / Parquet / TFRecord.
- Handle DSARs that span derivative datasets they did not produce.

All of the above is owned by Caudals. The supplier's job is to bring the data and the rights; the platform's job is to monetize them.

---

## 22 · Public marketing & demand capture

### The front door — fast, credible, easy to contact

The public surface is already in production: landing, contact, blog, waitlist, analytics. Its job is to convert latent demand into qualified conversations and to communicate a serious B2B data-operations posture to procurement teams researching the company. It is intentionally narrow until self-service surfaces are ready.

### Public surface inventory

| Route | Purpose | Status |
|---|---|---|
| `/` | Landing — thesis, capabilities, sample case studies, hero waitlist. | Live |
| `/contact` | Buyer / supplier / partner contact intake. | Live |
| `/blog` | Editorial publishing for SEO and credibility. | Live |
| `/blog/[slug]` | Article pages. | Live |
| `/api/contact` | Server-side contact submission. | Live |
| `/api/waitlist` | Waitlist registration. | Live |
| `/catalogue` | Public catalogue (curated listings). | Future — ships in roadmap M3 |
| `/customers` | Trust page (logos, case studies, certifications). | Future — ships when consented |
| `/security` | Public security & compliance posture page. | Future — ships at SOC 2 readiness |
| `/legal/*` | Privacy, ToS, DPA, supplier & buyer agreements. | Live (rolling updates) |

### Funnel instrumentation

- **Server-side capture** for contact and waitlist submissions, idempotent and audit-logged.
- **Lead enrichment** on submission: company match (employees, industry, region), routing to the appropriate operator.
- **Marketing analytics** via Umami (existing), product analytics later via PostHog when authenticated surfaces ship.
- **Spam & abuse controls**: rate limits, bot detection, jurisdiction-aware fields.

### Editorial standard

The blog is treated as a serious editorial channel: every post owns a single argument, sourced and dated. Topics that move the buyer's procurement conversation forward (provenance, EU AI Act, dataset documentation, modality-specific quality) are prioritised over generic AI commentary.

---

# Part IV · Running the Platform

Five sections covering the operational substrate: state machines, tooling, runbooks, security, observability and cost. Every dataset shipped depends on these working.

- 23 / 24 — Workflows & tooling
- 25 — Security & compliance
- 26 — Observability
- 27 — Cost & capacity

---

## 23 · Workflows and state machines

### Every record has a state machine. No exceptions.

Long-running business records (opportunities, briefs, builds, runs, contracts, deliveries, DSARs) move through explicit, audited state machines. State transitions emit events; events drive automation; automation never bypasses an explicit state. This is the difference between an operations platform and a CRM with side-effects.

### Buyer opportunity state machine

`new → qualifying → scoping → feasibility → pilot_quoted → pilot_active → pilot_delivered → full_quoted → full_active → delivered → on_subscription | closed_won | closed_lost`

### Supplier opportunity state machine

`new → qualifying → nda_signed → sample_received → feasibility_done → pilot_active → pilot_done → full_active → live → paused | terminated`

### Build state machine

```
PLANNED → INTAKING → PROFILING → CLEANING → PRIVACY → ENRICHING
                                                          │
                                                          ▼
DELIVERED ← RELEASED ← PACKAGING ← QA ← LABELING ◄────────┘
                                   │
                                   └─── (QA fail) ──► REWORK ──► re-enter pipeline
```

### Other key state machines

- **Run** — `queued → running → succeeded | failed | cancelled`; with retry counter, signal-aware.
- **Label batch** — `queued → in_review → in_adjudication → closed | requeued`.
- **Contract** — `drafting → awaiting_buyer → awaiting_supplier → signed → active → renewed | terminated`.
- **Delivery** — `scheduled → preparing → ready → sent → downloaded → accepted | disputed`.
- **DSAR** — `received → identity_verified → impact_assessed → propagating → completed`; SLA-tracked.

### Automation patterns

Each state transition emits a typed event consumed by automation: notifications, downstream job triggers, billing events, audit log entries. Operators see an **activity** column on every record showing the state stream in human-readable form.

---

## 24 · Internal tooling and runbooks

### Tooling that operators reach for, not engineers

Internal tooling exists to put platform power in the hands of operators without requiring them to write code, while still being scriptable for engineers when the situation demands it. The default is the console UI; the escape hatch is the CLI; the long-tail is direct database access under audit.

### The Caudals CLI

A single binary `caudals` wraps the most common operations:

| Command | Purpose |
|---|---|
| `caudals build plan <brief>` | Generate a build plan from a brief or template; outputs a YAML manifest for review. |
| `caudals build run <plan>` | Submit a build plan to Dagster; tracks the run. |
| `caudals build replay <build_id>` | Re-run a build from its manifest; verifies hash equality. |
| `caudals lineage trace <asset>` | Pretty-print the lineage graph for an asset version. |
| `caudals license check <build>` | Compute composed permitted-uses for a build before running it. |
| `caudals pii scan <asset>` | Run the PII detector and dump a structured report. |
| `caudals dataset publish <version>` | Promote silver to gold with the release manifest. |
| `caudals delivery sign <artefact>` | Sign a packaged artefact for delivery. |
| `caudals dsar propagate <ticket>` | Propagate a deletion/erasure request through derivative datasets. |
| `caudals fixture seed` | Seed dev / staging with deterministic fixtures. |

### Runbooks (canonical)

- **R-01 · Onboard a new supplier asset.** NDA → intake → profile → feasibility memo.
- **R-02 · Open a buyer brief.** Capture → qualify → map to template → quote.
- **R-03 · Run a pilot build.** Plan → execute → QA → deliver → debrief.
- **R-04 · Promote pilot to full build.** Reuse plan with full-volume parameters; recompute license.
- **R-05 · Handle a QA failure at G-7.** Triage → root-cause → rework path → re-enter pipeline.
- **R-06 · Process a DSAR.** Verify → impact-assess → propagate → notify buyers.
- **R-07 · Rotate a signing key.** Generate → publish → rotate → deprecate.
- **R-08 · Restore from disaster.** RPO/RTO targets, restore order, verification checklist.
- **R-09 · Release a refresh.** Pull deltas → rebuild → QA → ship to subscribers.
- **R-10 · Deprecate a dataset version.** Notice → sunset window → tombstone.

### Internal escalation surface

The console exposes a top-level *Escalations* view where any operator can flag: a suspected privacy incident, a contested provenance finding, a failing supplier delivery, a buyer dispute, or a security event. Escalations route to on-call operations and trigger the appropriate runbook automatically.

---

## 25 · Security, compliance, governance

### A posture regulators recognise

Caudals' commercial credibility depends on its security and compliance posture from day one. The platform is built to a level compatible with SOC 2 Type II, ISO 27001, GDPR, CCPA/CPRA and EU AI Act Article 10 documentation, even before formal certifications are pursued. The section below describes the controls; certification timing is in §30.

### Identity & access

- **Better Auth operator identity** with required TOTP enrollment for production operators; phishing-resistant passkeys remain available as additional hardening, and fixture operators stay password-only only for automated smoke tests.
- **Internal SSO scaffolded** but disabled until the Phase 3 buyer/supplier identity rollout.
- **Role-based access control** with least-privilege roles enforced at the database (RLS), service (server actions), and infrastructure layers (Tailscale ACLs).
- **Just-in-time elevation** for production database access; every elevation is recorded with reason and is time-bounded.
- **Buyer-side SSO + SCIM**; supplier-side SSO available on request.
- **Service-account hygiene**: short-lived credentials, rotated, never shared.

### Data protection

- **Encryption in transit.** TLS 1.3 mandatory on every public and internal endpoint.
- **Encryption at rest.** Object store, Postgres, lakehouse tables; KMS-managed keys with documented rotation.
- **Field-level encryption** for sensitive columns where the threat model demands.
- **Customer-managed keys** available for enterprise buyers with regulatory requirements.
- **Backups**: encrypted, off-region, restore-tested; RPO 24h, RTO 4h for OLTP.
- **Bronze layer immutability**: object lock with retention period prevents tampering or premature deletion.

### Network & infrastructure

- **Public surface area** is minimised: only the marketing site and approved API paths are reachable.
- **Admin access** via Tailscale only; public 22/tcp closed.
- **Egress controls**: outbound from operations VPC limited to allow-listed destinations; egress audited.
- **Secrets management**: centralised vault; no secrets in code, CI logs, or operator chat.
- **Vulnerability management**: Dependabot + automated container scans + scheduled penetration tests.
- **Incident response**: documented runbooks (R-08, security-specific R-11+), retainer with external IR firm.

### Compliance & governance

| Frame | Caudals posture |
|---|---|
| GDPR | Lawful basis tracked per asset; DPIA template; DSAR pipeline (R-06); DPO designated when required; data-processing register maintained. |
| CCPA / CPRA | Consumer-rights pipeline shared with GDPR; sale/sharing disclosure; deletion propagation through derivatives. |
| EU AI Act Art. 10 | Per-dataset documentation: governance, bias testing, representativeness, sources; aligned with the dataset card and datasheet packaged at delivery. |
| SOC 2 Type II | Controls aligned to Trust Services Criteria from day one; pursue audit at year 2 when revenue justifies. |
| ISO 27001 | ISMS scoped to platform; risk register maintained; pursue certification with SOC 2. |
| HIPAA | Optional posture for healthcare engagements: BAAs, segregated environment, encryption controls. |
| C2PA | Content credentials emitted on image / video / audio gold artefacts. |
| SPDX / CDLA | Standard license identifiers attached to every dataset version. |

### Audit & transparency

Every privileged action (data read, license change, key access, deletion, export) writes an `audit_event`. Audit retention is at least the longest contractual retention plus one year. Buyers and suppliers can request audit excerpts scoped to their own records and contracts.

---

## 26 · Observability and telemetry

### If a build is failing, we see it before the buyer does

The platform's observability posture must answer three classes of question fast: *is the platform healthy*, *is this build healthy*, and *did anything happen to this dataset version that matters*. Each question maps to a dedicated stack and surface.

### Three classes of telemetry

| Class | What it covers | Stack |
|---|---|---|
| Platform health | API latency, error rate, queue depth, GPU utilisation, storage capacity, container health. | OpenTelemetry → Prometheus + Grafana + Tempo + Loki + Sentry. |
| Pipeline health | Per-build progress, gate pass rate, run duration, retry rate, cost per build, reviewer queue depth. | Dagster events → OpenLineage → Marquez + Caudals dashboards. |
| Dataset events | Version creation, license change, refresh, DSAR propagation, delivery acceptance, deprecation. | Internal event bus → audit log + console activity feeds. |

### Service-level objectives (initial)

| Service | SLI | SLO |
|---|---|---|
| Public APIs | p95 latency | ≤ 250 ms |
| Internal console | p95 page load | ≤ 800 ms |
| Job queue | queue admit time | ≤ 30 s p95 |
| Pipeline | build replay equality | 100% on weekly sample |
| Delivery | signed-URL availability | 99.9% / month |
| Webhook receivers | processed within 5 min | 99.5% / month |

### Alerting policy

Alerts are routed to PagerDuty / on-call rotation when they affect buyer-visible delivery, supplier-visible portal, or audit/compliance invariants. Internal-only platform issues route to a non-paging channel during business hours unless they threaten an SLO.

### Build-cost telemetry

Every Dagster run reports compute time, GPU minutes, storage bytes read/written, and external API costs (LLM enrichment, third-party data, geocoding, etc.). Cost per build is a first-class metric on the build detail screen and rolls up to engagement-level margin reports.

---

## 27 · Cost and capacity planning

### Margin discipline at build level, not company level

Dataset operations is a margin-sensitive business. A single sloppy build — one without cost ceilings, careless GPU usage, or unchecked LLM-enrichment spend — can erase the margin on the engagement. Cost discipline is therefore enforced at planning time, not after-the-fact.

### Cost ledger

- Every Dagster op reports compute, storage, network and external-call costs.
- Costs accrete to a `build_id`, an `engagement_id`, and a `customer_id`.
- The console exposes *budget envelopes* per build with hard ceilings.
- Crossing 80% triggers a soft alert; crossing 100% requires explicit override.
- LLM and external API spending have separate sub-budgets; they cannot consume the whole envelope silently.

### Capacity model

| Resource | Bottleneck | Mitigation |
|---|---|---|
| CPU workers | Cleaning + profiling on TB tabular. | Polars / DuckDB scale-up; Spark only beyond TB. |
| GPU pool | CV / audio inference, embeddings, assistant labeling. | Burst-cloud capacity; on-prem baseline; pre-empt-able for non-critical. |
| Object storage | Multi-version retention + bronze immutability. | Tiered storage; cold tier for bronze older than N months. |
| Postgres | OLTP + lineage queries. | Read replicas for analytics; partitioning for `audit_event`. |
| Reviewer hours | Labeling SLA. | Workforce scheduling; pre-label automation; active learning. |
| External LLM API | Per-build enrichment cost. | Local OSS models for high-volume; per-prompt budget enforcement. |

### Pricing-aware planning

The build planner consumes the pricing table for each operator (compute per minute, storage per GB-month, GPU per hour, LLM per thousand tokens) and produces a cost estimate alongside the plan. This estimate is what operators quote against in §02 deliverables (feasibility memo, pilot quote, full-build quote). When actuals deviate from estimates by > 15%, a margin retrospective runs with the operator and the head of operations.

---

# Part V · Implementation Plan

Seven sections that turn the blueprint into a build sequence: the data model, the API surface, the roadmap, the team, the risks, a glossary, and the references that informed every decision in this document.

- 28 / 29 — Schema & APIs
- 30 — Roadmap
- 31 / 32 — Team & risks
- 33 / 34 — Glossary & references

---

## 28 · Data model

### The schema is the operations spine

The list below is the canonical core of the platform's relational schema. Naming is final; ID prefixes match the records; foreign-key edges are indicative. Migrations land in `db/migrations/*` with matching rollbacks in `db/rollbacks/*` and never bypass review.

### Domain map

#### Organizations & people

- `organization` — supplier, buyer, partner, internal.
- `contact` — named individuals at orgs, with roles and signing authority.
- `operator` — Caudals staff with role and skill profile.
- `reviewer` — labelers / adjudicators (in-house, partner, SME).

#### Demand & supply

- `buyer_opportunity` — pipeline record from inbound through close.
- `supplier_opportunity` — pipeline record for supplier acquisition.
- `dataset_brief` — structured buyer requirement.
- `supplier_asset` — declared data asset with rights metadata.

#### Rights & consent

- `contract` — signed legal agreement (supplier, buyer, NDA).
- `license_clause` — structured permitted-use granted by a contract.
- `consent_record` — subject-level consent attached to records or assets.
- `dsar_request` — subject-rights ticket with propagation tracking.

#### Pipeline state

- `build` — orchestration record for a buyer/supplier engagement.
- `build_plan` — serialized YAML manifest of the plan.
- `run` — a Dagster run instance against a `build_plan`.
- `gate_event` — pass / fail decisions at each gate.
- `label_batch` — unit of work in the labeling fabric.
- `qa_report` — quality scorecard with dimensions and verdict.

#### Datasets & lineage

- `dataset` — logical dataset family (a "SKU").
- `dataset_version` — concrete materialised version with hash, size, license, scorecard.
- `dataset_partition` — physical partitions in the lakehouse.
- `lineage_event` — OpenLineage event reference.
- `manifest_artifact` — build manifests, dataset cards, datasheets.
- `pii_map` — per-version PII detection & treatment record.

#### Catalogue & commerce

- `catalogue_listing` — public/partner listing entry.
- `private_offer` — targeted offer to a specific buyer.
- `quote` — priced proposal for a build / subscription.
- `subscription` — recurring delivery program.
- `delivery` — specific delivery instance with channel + receipt.
- `invoice`, `payment`, `payout` — commerce records.
- `revenue_share` — supplier-side accruals.

#### Operations & audit

- `audit_event` — cross-domain auditable action log.
- `cost_entry` — granular cost ledger line.
- `alert` — operations alert with state.
- `integration` — per-org integration credentials (encrypted).
- `signing_key` — platform / per-customer keys for delivery signing.

### Cross-cutting fields

Every record carries: `id` (ULID with a 2-char prefix per type), `created_at`, `updated_at`, `created_by`, `org_id` (RLS scope), `state` (per state machine), `deleted_at` (soft delete with retention policy). Tenancy is enforced at row level via Postgres RLS.

### Selected DDL — the load-bearing tables

```sql
-- supplier_asset: a declared data asset under a supplier contract
create table supplier_asset (
  id              text primary key,            -- "sa_" + ULID
  org_id          text not null references organization(id),
  name            text not null,
  modality        text not null check (modality in
                  ('tabular','text','image','video','audio','geospatial','timeseries','document')),
  declared_volume jsonb,                            -- {records|bytes|hours...}
  refresh_policy  text not null,                    -- one_shot|scheduled|on_event|perpetual
  sensitivity     text not null,                    -- public|confidential|pii|special
  rights_summary  jsonb not null,                   -- structured permitted-uses
  state           text not null default 'declared',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      text references operator(id)
);

-- license_clause: structured permitted use granted by a contract
create table license_clause (
  id                text primary key,           -- "lc_" + ULID
  contract_id       text not null references contract(id),
  asset_scope       jsonb not null,             -- which supplier_asset(s) it covers
  permits_train     boolean not null,
  permits_finetune  boolean not null,
  permits_eval      boolean not null,
  permits_inference_commercial boolean not null,
  permits_redistribute boolean not null,
  exclusivity       text not null default 'none', -- none|exclusive|category
  geo               text[] not null default '{WW}',
  term_starts_at    timestamptz,
  term_ends_at      timestamptz,
  share_alike       boolean not null default false,
  notes             text
);

-- dataset_version: concrete materialised version of a dataset family
create table dataset_version (
  id              text primary key,             -- "dv_" + ULID
  dataset_id      text not null references dataset(id),
  version_label   text not null,                -- "v3", "2026.05"
  build_id        text references build(id),
  manifest_uri    text not null,                -- s3://...manifest.json
  content_hash    text not null,                -- sha256 of canonical artefact
  size_bytes      bigint,
  record_count    bigint,
  composed_permits jsonb not null,              -- intersection of input licenses
  qa_score        numeric(4,3),
  state           text not null default 'draft',
  released_at     timestamptz,
  released_by     text references operator(id),
  signed_by       text                          -- signing_key.id
);
```

---

## 29 · API surface

### Three audiences, three API styles

The platform exposes three distinct API styles, each for a defined consumer. Mixing styles between consumers is forbidden; consumers see one API, contracts are tested at the boundary, and contract drift is caught in CI before deploy.

### API styles

| Style | Audience | Reason |
|---|---|---|
| Server actions | Internal console (operator UI). | End-to-end type safety with the React client; lowest friction. |
| tRPC | Buyer workspace, supplier portal. | Type-safe with versioned schemas; aligns with internal record model. |
| REST + signed | Partner integrations, programmatic delivery, webhooks. | Standard, language-neutral, easier for buyer engineering teams to consume. |

### Selected REST endpoints (buyer-facing)

```
# Datasets
GET    /v1/datasets                            # list catalogue / authorised
GET    /v1/datasets/{id}                       # dataset family detail
GET    /v1/datasets/{id}/versions              # versions for this dataset
GET    /v1/datasets/{id}/versions/{ver}        # specific version detail
GET    /v1/datasets/{id}/versions/{ver}/sample # preview (NDA-gated for private)
POST   /v1/datasets/{id}/versions/{ver}/access # request access to a private listing

# Briefs
POST   /v1/briefs                              # submit a custom-build brief
GET    /v1/briefs/{id}                         # brief detail / progress
POST   /v1/briefs/{id}/approve_quote           # buyer-side approval

# Deliveries
GET    /v1/deliveries                          # list buyer's deliveries
GET    /v1/deliveries/{id}                     # delivery detail + receipt
POST   /v1/deliveries/{id}/accept              # countersignature
POST   /v1/deliveries/{id}/dispute             # raise an acceptance issue

# Subscriptions
GET    /v1/subscriptions                       # active recurring deliveries
GET    /v1/subscriptions/{id}/refreshes        # refresh history
POST   /v1/subscriptions/{id}/pause            # pause refresh program

# Webhooks (caudals -> buyer)
POST   {buyer-receiver}                        # delivery.ready, refresh.published, dataset.deprecated
```

### Authentication & signing

- Bearer tokens for buyer/supplier APIs, scoped per organization.
- HMAC signatures on partner-emitted webhooks; replay window 5 min.
- Caudals webhooks signed with rotating Ed25519 keys; receivers verify against published key set.
- Signed-URL deliveries use short-lived tokens with audit-logged retrieval.

### Versioning & deprecation

API surfaces are versioned in path (`/v1/...`). Breaking changes ship under a new version with a 6-month overlap. The deprecation calendar is published; deprecated endpoints emit a `Sunset` header and a deprecation event in webhooks. No silent breaking changes ever.

### Internal-only endpoints

Operations endpoints (job submission, lineage queries, license-policy evaluation, DSAR propagation) are reachable only from within the operations VPC and require a Caudals service identity. They are not documented in any external surface.

---

## 30 · Implementation roadmap

### Operator-grade in 90 days. Self-serve by month 12.

The roadmap is sequenced to put the operations spine on its feet first, populate the catalogue with real, sold datasets next, and ship self-service surfaces only after operations are reliable. Dates are targets relative to Day 0 = adoption of this blueprint.

### M0 · Day 0–30 — Foundations

- Adopt the schema (§28); migrate any existing admin-side records.
- Stand up bronze / silver / gold buckets with lakeFS atop existing object store.
- Stand up Dagster orchestrator with three reference assets (intake, profile, qa).
- Implement license-clause vault and the composition algebra (§17).
- Ship the operator console v0: leads, suppliers, buyers, builds (read-only deep links).
- Wire OpenLineage emission from existing pipelines into Marquez.

### M1 · Day 30–90 — Operator-grade

- Pipeline gates G-1…G-7 enforced; rebuild & replay CLI working.
- PII detector pool with Presidio + spaCy + custom recognisers.
- Cleaning operator library v1 (~30 operators) with deterministic-output tests.
- Label Studio embedded for tabular / text; CVAT for images; reviewer queue with adjudication.
- QA scoring engine v1 with composite Q-score and exception report.
- Packaging targets: Parquet, JSONL, COCO, HF Datasets, signed-URL delivery.
- Operator console v1: full CRUD, command palette, audit overlays, build detail screen.
- **North-star milestone**: 5 concurrent builds, end-to-end with full lineage and licensed delivery.

### M2 · Day 90–180 — Catalogue & modalities

- Catalogue listing model + private-offer model + sample-preview gating.
- Modality coverage extended: video, audio, geospatial.
- Active-learning loop wired with FiftyOne Brain / Lightly-style sampling.
- Cleanlab pass integrated into the QA stage.
- Subscription delivery model with delta manifests.
- Buyer workspace v0: read-only delivery + scorecard view.
- Supplier portal v0: asset declaration, sample upload, build participation.

### M3 · Day 180–365 — Self-service & commercial

- Public catalogue at `/catalogue` (curated subset).
- Buyer brief intake from public web; auto-routed to operator queue.
- Buyer workspace v1: subscriptions, integrations, billing.
- Supplier portal v1: revenue share, payouts via Stripe Connect.
- Document & time-series modality coverage at production quality.
- SOC 2 Type I audit underway; ISO 27001 ISMS scoped.
- EU AI Act Article 10 documentation auto-generated per dataset.
- Croissant manifest emission default; HF mirror channel for public assets.

### M4 · Beyond 12 months

- SOC 2 Type II completed; HIPAA-eligible environment for healthcare.
- Self-serve catalogue purchase flow for low-friction asset classes.
- Programmatic-labeling and weak-supervision flows productised.
- Cross-region delivery (US east + EU west); customer-managed keys.
- Marketplace network effects: supplier ↔ buyer matching by signal.

---

## 31 · Team structure & RACI

### A small team. Clear ownership.

The first 12 months are deliberately small-team. Roles below are function-level; one person can fill multiple. The RACI matrix is what matters: every load-bearing area of the platform has exactly one accountable owner.

### Function map (12-month team)

| Function | Responsibility | Headcount target |
|---|---|---|
| Founder / CEO | Strategy, sales, fundraising, supplier outreach. | 1 |
| Founder / CTO | Architecture, security, platform sequencing. | 1 |
| Platform engineer | App + infra: console, APIs, deployment. | 1–2 |
| Data engineer | Pipeline core: orchestrator, lakehouse, lineage. | 1–2 |
| ML / data scientist | QA scoring, active learning, profiling, embeddings. | 1 |
| Operations lead | Build delivery, supplier coordination, buyer success. | 1 |
| Labeling lead | Reviewer fabric, ontology governance, partner workforce. | 1 (year 2) |
| Privacy / compliance lead | Rights, consent, DSARs, certification programs. | 1 fractional then full |
| Sales / partnerships | Buyer demand, supplier acquisition. | 1 (year 2) |
| Designer | Console + buyer/supplier UX, brand. | 1 fractional |

### RACI on load-bearing areas

| Area | R | A | C | I |
|---|---|---|---|---|
| Architecture | CTO | CTO | Platform, Data eng | Founders |
| Pipeline core | Data eng | CTO | ML, Ops | Founders |
| Console UX | Platform eng + Designer | CTO | Ops | Founders |
| Privacy posture | Privacy lead | CEO | CTO, Ops | Buyers |
| Build delivery | Ops lead | CEO | Data eng, Privacy | Buyers |
| Quality scoring | ML | CTO | Ops | Buyers |
| Catalogue listings | Ops + Designer | CEO | Sales, Privacy | Suppliers |
| Commercial ops | CEO | CEO | Ops, Privacy | Founders |
| Security | CTO | CTO | Privacy | Buyers |
| Compliance certifications | Privacy lead | CEO | CTO | Buyers |

---

## 32 · Risks and mitigations

### The honest register

Every line in this register is a known way the platform can fail commercially, legally, technically or operationally. Each carries an owner. The register is reviewed monthly; mitigations move from "planned" to "in place" with audit evidence.

| ID | Risk | Mitigation | Severity | Owner |
|---|---|---|---|---|
| R-01 | Privacy incident | P-05 ingest-time PII; immutable bronze; KMS-controlled token vault; staff training; IR retainer. | CRITICAL | Privacy |
| R-02 | Licensing dispute | License clauses as code; intersection at plan time; signed contracts attached; audit retention. | CRITICAL | CEO/Privacy |
| R-03 | Buyer rejects on QA | Sample previews + scorecards before quote; pilot before full build; 7-day acceptance window with clear dispute path. | HIGH | Ops |
| R-04 | Supplier withdraws data | Termination clauses; tombstone propagation; subscription deltas reversible; alternative-supplier mapping for core SKUs. | HIGH | CEO |
| R-05 | Build cost overrun | Cost ledger + envelopes; LLM sub-budgets; margin retros > 15%. | HIGH | Ops |
| R-06 | Compute capacity shortfall | Burst-cloud GPU; non-critical pre-emption; queue prioritisation by build SLA. | MEDIUM | CTO |
| R-07 | Reviewer quality drift | Gold questions; agreement metrics; Cleanlab pass; reviewer cohort rotation. | MEDIUM | Labeling |
| R-08 | Lineage gaps | OpenLineage default-on; CI replay tests; nightly lineage-completeness audit. | MEDIUM | Data eng |
| R-09 | Schema drift between modules | Generated types from migrations; contract tests in CI; PR-level migration review. | MEDIUM | Platform |
| R-10 | Vendor lock-in (lakeFS, Dagster, etc.) | Choose vendor-neutral protocols (OpenLineage, Iceberg, Croissant); evaluate alternatives yearly. | MEDIUM | CTO |
| R-11 | Regulatory change (EU AI Act, etc.) | Per-asset documentation auto-generated; legal counsel on retainer; quarterly posture review. | HIGH | Privacy |
| R-12 | Reputational risk from sourced data | Source allow-list; supplier KYC; refusal categories documented; public ethics policy. | HIGH | CEO |
| R-13 | Single founder/key-person dependency | Cross-train; runbooks (R-01..R-10); BCP plan; bus-factor in security reviews. | MEDIUM | CEO |
| R-14 | Buyer security review delays | Public security page (M3); SOC 2 in flight; standard DPA; security questionnaire library. | MEDIUM | Privacy |
| R-15 | Synthetic-data utility / privacy gap | Conservative defaults; utility-vs-privacy report at every synthetic build; no silent blending with real. | MEDIUM | ML |

---

## 33 · Glossary

### Vocabulary used throughout the platform

Naming is part of the architecture. Every Caudals operator, engineer and document should use these terms identically. New vocabulary is proposed via PR against this glossary.

**Asset** — A first-class artefact: a `supplier_asset` (input), a `dataset_version` (output), or a `manifest_artifact`. Every asset has a hash, a license posture, and a lineage manifest.

**Bronze / Silver / Gold** — Medallion layers: raw + sealed (bronze), cleaned/conformed/PII-handled (silver), ML-ready packaged + scored (gold).

**Build** — A scoped engagement that turns one or more `supplier_asset`s and a `dataset_brief` into one or more `dataset_version`s, governed by a `build_plan`.

**Build plan** — A YAML manifest naming the operators, parameters, ontology, gates, and license posture for a build. Versioned in git.

**Catalogue listing** — A public or partner-only entry exposing a `dataset_version` family for purchase, with sample preview, scorecard, license tier, and price.

**Composed permits** — The intersection of permitted-uses across input licenses, computed at build plan time; the maximum set of uses the output can support.

**DSAR** — Data Subject Access Request — including erasure, portability, and rectification requests. Tracked end-to-end through derivative datasets.

**Gate** — A contract between two pipeline stages. Promotion to the next stage requires a passing gate evaluation and a recorded sign-off.

**Gold question** — A pre-labeled item secretly inserted into a reviewer's queue to measure ongoing reviewer accuracy.

**HITL** — Human-in-the-loop — labeling strategies that put human reviewers in the loop with model assistance.

**Lineage event** — An OpenLineage-compliant record of a transformation: inputs, outputs, code SHA, parameters, status, facets.

**License clause** — A structured permitted-use record granted by a contract: train, fine-tune, eval, infer commercial, redistribute, geo, exclusivity, term.

**Manifest** — A signed JSON describing a packaged dataset: version, content hash, schema, license, lineage references, signing key.

**Operator (Caudals)** — A staff role with platform access: data engineer, operations lead, privacy lead, etc. Distinct from "operator" in the pipeline sense.

**Operator (pipeline)** — A reusable, typed transformation in the cleaning / enrichment / labeling library; a Dagster op with a contract.

**PII map** — A per-version structured record of detected PII locations and the treatment applied to each.

**Programmatic labeling** — Generation of labels through heuristics, rules, classifiers and LLMs (labeling functions), unified by a label model.

**QA scorecard** — The composite quality artefact attached to every released `dataset_version`, exposing component scores and a release verdict.

**Reproducible build** — A build whose `dataset_version` is byte-identical to its prior release when re-run from the manifest at the same git SHA. Verified weekly in CI.

**RLS** — Row-level security — Postgres policy enforcement scoped per organization; the primary tenancy boundary.

**SKU (dataset)** — A logical dataset family with a stable identity, multiple versions, and a license tier; the unit of catalogue listing.

**Subscription delivery** — A recurring delivery program where successive `dataset_version`s are emitted to the buyer with delta manifests.

**Tombstone** — A marked-deleted `dataset_version` with retained metadata and a deletion-required notice for downstream consumers.

**Weak supervision** — Snorkel-style labeling: heuristics and small models vote; a label model resolves conflicts to produce probabilistic labels.

---

## 34 · References & canonical sources

### What this blueprint stands on

Public references and standards that informed this document, grouped by domain. Internal Caudals documents are listed first; the rest are public primary sources.

### Internal Caudals references

- `AGENTS.md` — agent operating instructions (root of repository).
- `docs/product-specs/overview.md` — canonical product / business briefing.
- `docs/ARCHITECTURE.md` — live technical contract and deployment posture.
- `docs/DESIGN.md` — design system and visual governance.
- `docs/FRONTEND.md` — frontend implementation contract.
- `docs/TOOLS.md` — operational tooling and runbook.

### Standards and specifications

- **OpenLineage Specification** (Linux Foundation AI & Data) — lineage event format adopted platform-wide.
- **MLCommons Croissant** — machine-readable dataset metadata interchange.
- **C2PA Technical Specification 2.x** — content credentials for media provenance.
- **Apache Iceberg** & **Lance** table formats — canonical lakehouse formats.
- **SPDX License List** & **CDLA** (Linux Foundation) — license identifier registry.
- **STAC** (SpatioTemporal Asset Catalog) — geospatial cataloguing standard.
- **Hugging Face Dataset Cards** — standard documentation pattern adopted at delivery.
- **W3C PROV** — provenance data model underpinning lineage thinking.

### Regulatory frames

- **EU AI Act, Regulation (EU) 2024/1689**, especially Article 10 (training-data governance for high-risk AI).
- **GDPR (EU 2016/679)** and DPIA / DSAR provisions.
- **CCPA / CPRA** — consumer privacy posture for US engagements.
- **SOC 2** Trust Services Criteria 2017 with 2022 revisions.
- **ISO/IEC 27001:2022** ISMS requirements.
- **HIPAA** Security & Privacy Rules for healthcare engagements.

### Foundational papers & bodies of work

- Gebru et al., *Datasheets for Datasets*, CACM, 2021.
- Mitchell et al., *Model Cards for Model Reporting*, FAT*, 2019.
- Northcutt et al., *Confident Learning*, JAIR, 2021 (Cleanlab).
- Ratner et al., *Snorkel: Rapid Training Data Creation with Weak Supervision*, VLDB, 2017.
- Carlini et al., series of papers on training-data extraction and benchmark contamination, 2021–2024.
- Stanford CRFM, *HELM* & *HEIM* evaluation reports.
- OpenDP and Tumult Analytics technical documentation on differential privacy in practice.

### Reference platforms surveyed (non-endorsement)

Scale AI, Surge AI, Labelbox, V7 Darwin, Encord, Roboflow, Snorkel Flow, Cleanlab Studio, Galileo, Lightly, Hugging Face Hub, Voxel51 FiftyOne, Activeloop Deep Lake, Argilla, Label Studio, CVAT, doccano, Prodigy, Great Expectations, Soda Core, Pandera, ydata-profiling, whylogs, Microsoft Presidio, OpenDP, SDV, Gretel, Mostly AI, Qdrant, LanceDB, Weaviate, pgvector, lakeFS, DVC, Pachyderm, Marquez, Dagster, Temporal, Prefect, Airflow, Feast, MLflow, Unstructured.io, LlamaParse, AWS Textract, TorchGeo, GeoPandas, TimescaleDB.

---

## End of document

### One platform. One operations spine. One source of truth.

This document is the canonical technical specification for the Caudals platform. Updates land via PR against `docs/blueprints/`; supersedes are recorded explicitly in §00.

| | |
|---|---|
| **Versioning** | Document revisions follow semantic versioning. Breaking changes to architecture or schema require a major bump and a migration plan. |
| **Maintenance** | Owned by Caudals Platform Engineering. Reviewed quarterly; triggered updates after major product or compliance changes. |
| **Distribution** | Internal · do not distribute externally without explicit founder approval. Excerpts may be quoted in buyer security reviews. |

---

*Caudals — Platform Blueprint · Volume 01 · Document 01 · Revision 1.2 · Issued 2026-05-09*

*Pairs with: `AGENTS.md` · `docs/ARCHITECTURE.md` · `docs/product-specs/overview.md`*
