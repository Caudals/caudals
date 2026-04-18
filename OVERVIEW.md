# Caudals Overview

## One-Line Description
Caudals is a B2B marketplace and managed data operations company that helps businesses sell proprietary data and helps AI teams buy clean, compliant, ML-ready datasets.

## Short Description
Caudals connects two sides of the AI data market:
- companies that own useful data and want to monetize it,
- companies building AI models that need high-quality datasets for training, fine-tuning, evaluation, or enrichment.

Caudals sits in the middle. We source data, validate rights, negotiate access, preprocess raw files, clean and normalize schemas, anonymize sensitive fields, curate and label records, run quality checks, package the dataset in ML-ready formats, and publish or deliver the dataset to buyers.

The long-term product is a B2B data marketplace. The near-term product is a high-touch managed service supported by a landing page, contact form, blog, and private admin dashboard.

## What Caudals Does
Caudals provides three core capabilities:

1. Data supply creation:
   We identify and onboard companies with proprietary data that could be valuable for AI training or evaluation.

2. Dataset operations:
   We transform raw company data into usable AI datasets through preprocessing, cleaning, deduplication, anonymization, enrichment, curation, labeling, formatting, QA, and documentation.

3. Dataset commercialization:
   We package datasets for sale through private offers, custom projects, future marketplace listings, subscriptions, one-off licenses, or recurring data feeds.

## Platform Model
Caudals has three practical sides:

1. Buyers:
   Companies that need datasets to train, fine-tune, evaluate, benchmark, or enrich AI systems.

2. Suppliers:
   Companies that own valuable data and want to monetize it without building their own marketplace, sales pipeline, privacy workflow, delivery infrastructure, or AI data operations team.

3. Caudals operations:
   The internal team and tooling that qualify leads, verify data rights, manage supplier assets, build datasets, run QA, package listings, manage contracts, and deliver data to buyers.

## Core Workflows
### Buyer Workflow
1. Buyer submits a dataset need through the contact form or direct sales channel.
2. Caudals qualifies the request:
   - AI use case
   - data modality
   - industry
   - geography
   - freshness
   - volume
   - format
   - budget
   - timeline
   - sensitivity and compliance constraints
3. Caudals determines the best path:
   - existing or future catalog dataset,
   - supplier-led build,
   - public-data enrichment,
   - custom data sourcing,
   - feasibility study,
   - pilot dataset build,
   - full dataset build.
4. Caudals provides samples, schemas, quality reports, licensing terms, and delivery options.
5. Buyer purchases or continues into a larger build.
6. Caudals delivers the dataset in agreed ML-ready formats and records acceptance evidence.

### Supplier Workflow
1. Supplier company offers data or expresses monetization interest.
2. Caudals evaluates:
   - commercial fit,
   - buyer demand,
   - rights and permitted uses,
   - PII or sensitive data risk,
   - uniqueness,
   - freshness,
   - schema quality,
   - update cadence,
   - licensing constraints.
3. Caudals scopes ingestion and transformation.
4. Caudals builds a pilot or complete dataset.
5. Caudals prepares a private offer or marketplace listing.
6. Supplier receives negotiated revenue share when the dataset sells.

### Internal Admin Workflow
The admin dashboard should become the operational control room for:
- buyer and supplier leads,
- qualification state,
- supplier data assets,
- source access,
- data rights,
- provenance,
- PII status,
- dataset build stage,
- blockers,
- QA score,
- catalog listing readiness,
- pricing,
- quotes and contracts,
- invoices and payments,
- supplier revenue share,
- audit history.

## Dataset Operations Pipeline
Caudals turns raw data into AI-ready datasets through a staged pipeline:

1. Intake:
   Receive files, database exports, API access, warehouse shares, or source documentation.

2. Rights and risk review:
   Verify ownership, consent, permitted use, AI-training rights, privacy obligations, and licensing boundaries.

3. Profiling:
   Inspect schema, formats, missingness, duplicates, distributions, field types, volumes, and source quality.

4. Cleaning:
   Standardize values, remove duplicates, fix malformed records, normalize units, repair encoding issues, and handle missing data.

5. Privacy handling:
   Detect PII, minimize sensitive fields, anonymize or pseudonymize when needed, and document privacy assumptions.

6. Enrichment:
   Add public data, derived features, taxonomy mappings, geocoding, categories, or domain-specific metadata when useful.

7. Labeling and curation:
   Define ontology, label records, review edge cases, sample for quality, and resolve ambiguous examples.

8. Packaging:
   Deliver in formats such as CSV, Parquet, JSONL, COCO, YOLO, TFRecords, signed downloads, S3-compatible storage, API, or warehouse share.

9. QA and documentation:
   Provide schema, data dictionary, quality scorecard, known limitations, lineage/provenance summary, PII/compliance summary, and permitted-use summary.

10. Publication or delivery:
   Publish a catalog/private-offer listing or deliver directly to the buyer.

## Customer Profiles
### Buyer Customers
Buyer customers are companies building or improving AI systems. They may be:
- AI startups needing domain-specific training data,
- enterprise ML teams building internal models,
- product teams fine-tuning LLMs or vertical AI models,
- computer vision teams needing image/video datasets,
- logistics, retail, healthcare, agriculture, manufacturing, finance, telecom, energy, insurance, or real estate teams with predictive-modeling needs,
- companies needing evaluation datasets, benchmark sets, edge-case datasets, or recurring data feeds.

Buyer pain points:
- hard to find proprietary data,
- unclear rights and usage terms,
- generic public datasets are not good enough,
- internal data teams are too slow or overloaded,
- labeling vendors do not solve sourcing or licensing,
- data quality issues waste model-training cycles,
- compliance teams need provenance and privacy evidence.

Buyer value proposition:
- faster access to usable datasets,
- clear rights and permitted use,
- ML-ready formats,
- quality reports and samples before commitment,
- lower operational burden,
- ability to request custom datasets.

### Supplier Customers
Supplier customers are data-rich companies that may not think of themselves as data vendors. They may own:
- transaction data,
- logistics and route data,
- industrial or IoT sensor data,
- retail and e-commerce behavior data,
- agricultural or environmental data,
- geospatial data,
- B2B operational data,
- support, document, or text datasets,
- images, video, or inspection records,
- domain-specific historical records.

Supplier pain points:
- valuable data sits unused,
- selling data requires sales, legal, privacy, packaging, and delivery work,
- AI buyers require formats and documentation suppliers do not have,
- compliance and reputational risk are unclear,
- marketplace distribution is hard to operate.

Supplier value proposition:
- monetize data without building a marketplace,
- keep Caudals responsible for preprocessing and buyer acquisition,
- receive revenue share on sales,
- get data quality and packaging handled,
- reduce legal/privacy ambiguity before publication.

### Internal Users
Internal Caudals users are operators, founders, sales, data engineers, data scientists, label reviewers, and admins.

Internal needs:
- lead qualification,
- project scoping,
- source and supplier tracking,
- rights and PII tracking,
- dataset build tracking,
- QA review,
- catalog publication workflow,
- commercial operations,
- auditability.

## Market Context
AI teams increasingly need differentiated datasets, not just more model access. Public datasets are often too generic, stale, overused, legally ambiguous, or poorly suited to a specific domain. Meanwhile, many companies own valuable data but lack the expertise, buyer network, compliance process, and packaging infrastructure to sell it safely.

Caudals sits between several existing categories:
- Data marketplaces such as AWS Data Exchange, Snowflake Marketplace, Google Cloud Marketplace, Datarade, Databricks Marketplace, and similar platforms.
- Data labeling and annotation providers such as Scale AI, Appen, AWS SageMaker Ground Truth, and specialist annotation vendors.
- Data engineering and AI consulting firms that build custom pipelines and data products.
- Data monetization platforms that help providers package and distribute data products.

Caudals' differentiation is the combination of:
- marketplace demand generation,
- supplier-side monetization,
- managed dataset engineering,
- rights/provenance/privacy review,
- custom dataset builds,
- future catalog listings,
- revenue share for suppliers.

The goal is not to be only a listing directory, only a labeling provider, or only a consulting shop. The goal is to become a trusted transaction and operations layer for AI-ready B2B datasets.

## Pricing and Service Tiers
The current commercial model has three service tiers. These ranges are planning estimates, not fixed public quotes.

### 1. Dataset Feasibility Study
Purpose:
Determine whether a dataset can be sourced, built, licensed, cleaned, and delivered with acceptable risk and expected buyer value.

Best for:
- buyers asking whether a dataset is possible,
- suppliers asking whether their data is marketable,
- regulated or uncertain data opportunities,
- projects where scope, rights, or data availability is unclear.

Planning price:
- $3,000-$7,500 fixed fee
- optionally credited toward a pilot if signed within 30 days

Duration:
- 5-10 business days

Deliverables:
- feasibility memo,
- source/supplier map,
- risk register,
- target schema,
- quality criteria,
- rough build plan,
- cost range,
- timeline,
- go/no-go recommendation.

### 2. Small Pilot Dataset Build
Purpose:
Build a constrained dataset sample that proves quality, usefulness, feasibility, and commercial value before a larger commitment.

Best for:
- buyers who need a model/evaluation spike,
- suppliers testing monetization potential,
- one use case or one supplier asset,
- one to three data sources,
- early private-offer or catalog-listing validation.

Planning price:
- $12,000-$35,000 project fee
- pass-through costs for third-party data, specialist annotation, legal review, or infrastructure when needed
- optional 30-50% credit toward the complete build

Duration:
- 2-4 weeks

Typical scope:
- 5,000-50,000 records/items or a constrained modality sample,
- schema profiling,
- cleaning,
- deduplication,
- normalization,
- PII screening/anonymization,
- lightweight enrichment or labeling,
- QA scorecard,
- delivery in ML-ready format.

Deliverables:
- pilot dataset artifact,
- schema/data dictionary,
- sample preview,
- QA and rights summary,
- known limitations,
- recommendation for complete build, catalog listing, or stop.

### 3. Complete Dataset Build
Purpose:
Deliver a production-grade dataset for buyer use, private offer, catalog listing, or recurring data supply.

Best for:
- production buyer delivery,
- reusable catalog listings,
- multi-source builds,
- recurring data programs,
- strategic supplier partnerships.

Planning price:
- starts at $50,000
- common range: $50,000-$250,000 for focused single-domain builds
- complex, regulated, multimodal, or recurring programs can exceed $250,000

Duration:
- 6-12 weeks for focused builds
- 12-20+ weeks for complex, regulated, multimodal, multi-supplier, or recurring programs

Typical scope:
- multi-source sourcing and supplier coordination,
- contract/licensing workflow,
- secure ingestion,
- cleaning and standardization,
- anonymization,
- enrichment,
- ontology and labeling workflow,
- QA sampling,
- train/validation/test split strategy where needed,
- quality scoring,
- catalog/private-offer packaging,
- delivery via signed download, S3-compatible storage, API, or warehouse share.

Deliverables:
- production dataset package,
- schema and data dictionary,
- lineage/provenance report,
- rights and permitted-use summary,
- PII/compliance summary,
- QA scorecard,
- acceptance evidence,
- refresh/update plan when applicable,
- marketplace listing copy and sample preview.

## Product Surfaces
### Live Public Surface
- Homepage/landing page
- Contact page
- Blog
- Waitlist/contact APIs

### Private Current Surface
- Internal admin access and operational infrastructure

### Future Surfaces
- Buyer marketplace/catalog
- Buyer dataset brief intake
- Supplier data onboarding
- Supplier asset management
- Dataset build dashboard
- Catalog listing management
- Commercial operations dashboard

## Elevator Pitch
Companies need better datasets to build better AI, but the best data is often locked inside other companies, poorly formatted, legally unclear, or not packaged for machine learning. Caudals is the B2B marketplace and managed operations layer that unlocks that data. We help suppliers monetize proprietary datasets, help buyers acquire AI-ready data, and handle the messy middle: sourcing, licensing, preprocessing, cleaning, anonymization, curation, labeling, QA, packaging, and delivery.

## Longer Pitch
Caudals helps AI teams get the data they actually need. Instead of relying on generic public datasets or building a bespoke sourcing and cleaning operation from scratch, buyers can work with Caudals to define a dataset, validate feasibility, review samples, and receive a production-ready package with schema, quality checks, provenance, and usage rights.

On the supplier side, many companies have valuable operational data but no practical way to sell it. Caudals gives those companies a managed monetization path. We validate rights, process and anonymize the data, package it into AI-ready formats, and connect it with buyers through private offers and future marketplace listings.

Caudals is not just a marketplace directory and not just a labeling vendor. It is the operational layer that makes B2B AI data transactions possible.

## Useful One-Sentence Variants
- Caudals is a B2B marketplace for AI-ready company datasets.
- Caudals helps companies monetize proprietary data and helps AI teams buy datasets they can actually train on.
- Caudals turns raw company data into compliant, ML-ready datasets for AI builders.
- Caudals intermediates B2B data transactions and handles sourcing, licensing, cleaning, curation, labeling, QA, and delivery.