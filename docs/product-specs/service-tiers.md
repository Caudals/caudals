# Service Tiers Spec

## Purpose
Define Caudals' three commercial service tiers for the B2B dataset pivot. These are planning ranges for product, sales, and implementation, not final public quotes.

## Market Benchmarks
Public market signals as of 2026-04-18:
- Data marketplaces commonly support subscription, pay-as-you-go, private offers, and custom quotes. AWS Data Exchange supports subscription and pay-as-you-go products. Snowflake Marketplace supports subscription and usage-based plans such as monthly and per-query charges. Google Cloud data products support free and subscription pricing plus custom quotes.
- Data-provider commercialization tooling is often sold to suppliers as annual SaaS. Monda's Datarade-related plans list annual starting prices of $6,000, $10,000, and $15,000 for data storefront, marketplace distribution, analytics, and provider support.
- Managed annotation and labeling is priced by unit and complexity. AWS SageMaker Ground Truth examples include per-object pricing and Ground Truth Plus custom quotes. PixlData lists managed annotation starting at $0.10 per image, $15 per video minute, $5 per audio minute, and $0.05 per text sentence.
- Data and AI engineering labor drives full dataset build costs. 2026 rate benchmarks put senior data engineering at roughly $150-$185/hour in the US/Canada, with AI/ML engineering often starting around $200/hour for mid-level work and higher for lead architects.
- Enterprise AI training-data programs are frequently positioned as five-figure to seven-figure engagements because cost includes sourcing, licensing, structuring, labeling, QA, and delivery systems, not just labels.

Reference URLs:
- https://aws.amazon.com/data-exchange/pricing/
- https://docs.snowflake.com/en/collaboration/provider-listings-pricing-model
- https://cloud.google.com/marketplace/docs/partners/data
- https://www.monda.ai/pricing/datarade
- https://aws.amazon.com/pt/sagemaker-ai/groundtruth/pricing/
- https://pixldata.com/pricing
- https://dataconsultingfirms.com/insights/data-engineering-hourly-rates
- https://aitrainingdata.ai/ai-training-data-pricing-guide-2026/

## Pricing Principles
- Quote in USD or EUR depending on customer context; keep internal planning in USD until finance decides otherwise.
- Supplier listing is free by default; Caudals earns through buyer project fees, marketplace take rate, or managed revenue share.
- Supplier revenue share target: supplier earns 60-70% of net dataset sale revenue when Caudals owns processing, buyer acquisition, and marketplace operations.
- Third-party data licenses, cloud transfer/storage, specialist labeling labor, legal review, and regulated-domain experts can be pass-through costs.
- Feasibility fees can be credited toward a pilot or full build when strategically useful.

## Tier 1: Dataset Feasibility Study
Best for buyers asking "can this dataset be acquired or built?" and suppliers asking "is our data marketable?"

Planning price:
- $3,000-$7,500 fixed fee
- Optional credit toward a pilot if signed within 30 days

Duration:
- 5-10 business days

Scope:
- buyer requirement or supplier asset discovery call,
- data availability and source mapping,
- rights, provenance, PII, and licensing risk screen,
- schema/sample assessment when data is available,
- rough build plan, cost range, timeline, and go/no-go recommendation,
- suggested pricing model: one-off license, subscription, private offer, or revenue share.

Deliverables:
- feasibility memo,
- source/supplier map,
- risk register,
- target schema and quality criteria,
- pilot/full-build estimate.

Exclusions:
- production ingestion,
- large-scale cleaning or labeling,
- legal opinion,
- buyer-ready dataset delivery.

## Tier 2: Small Pilot Dataset Build
Best for proving demand, quality, and operations before a larger marketplace listing or private buyer contract.

Planning price:
- $12,000-$35,000 project fee
- Third-party data, specialist annotation, legal, and infrastructure pass-through when required
- Optional 30-50% credit toward a complete build for the same scope

Duration:
- 2-4 weeks

Typical scope:
- one buyer use case or one supplier dataset,
- one to three sources,
- 5,000-50,000 records/items or a constrained modality sample,
- ingestion and schema profiling,
- cleaning, deduplication, normalization, PII screen/anonymization,
- lightweight enrichment or labeling,
- QA scorecard and known-limitations report,
- delivery in ML-ready format such as Parquet, JSONL, CSV, COCO, YOLO, or TFRecords where relevant.

Deliverables:
- pilot dataset artifact,
- schema/data dictionary,
- sample preview,
- QA and rights summary,
- recommendation for complete build, catalog listing, or stop.

Acceptance bar:
- buyer can run a model/evaluation spike,
- supplier can see marketability and expected revenue model,
- Caudals can estimate full-build cost and margin with materially lower uncertainty.

## Tier 3: Complete Dataset Build
Best for production buyer delivery, reusable catalog listings, or recurring data supply programs.

Planning price:
- Starts at $50,000
- Common range: $50,000-$250,000 for focused single-domain builds
- Complex, regulated, multimodal, or recurring programs can exceed $250,000 and should be quoted individually

Duration:
- 6-12 weeks for focused builds
- 12-20+ weeks for multi-supplier, regulated, multimodal, or recurring programs

Typical scope:
- multi-source sourcing and supplier coordination,
- contract/licensing workflow and rights capture,
- secure ingestion and data-room organization,
- data cleaning, standardization, deduplication, enrichment, and anonymization,
- labeling ontology, annotation workflows, reviewer QA, and acceptance sampling,
- train/validation/test split strategy where needed,
- quality scoring for completeness, consistency, freshness, representativeness, and leakage risk,
- catalog listing or private offer preparation,
- buyer delivery through signed download, S3-compatible storage, API, or warehouse share.

Deliverables:
- production dataset package,
- schema and data dictionary,
- lineage/provenance report,
- rights and permitted-use summary,
- PII/compliance summary,
- QA scorecard and acceptance evidence,
- refresh/update plan when applicable,
- marketplace listing copy and sample preview.

Commercial model:
- buyer pays project fee, subscription, or private offer,
- supplier earns negotiated revenue share where supplier-owned data is used,
- Caudals margin comes from managed build fees plus marketplace take rate.

## Tier Selection Rules
- Use feasibility when data rights, source access, buyer value, or compliance risk is uncertain.
- Use pilot when there is a plausible buyer/supplier fit but the team needs proof before committing to production scale.
- Use complete build when source access, rights, budget, and target use case are sufficiently clear.
- Do not skip feasibility for regulated personal data, health, finance, geolocation, children/minors, biometric, or cross-border data.
