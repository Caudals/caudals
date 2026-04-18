# 2026-04-18 - B2B Marketplace Pivot Docs

## Summary
- Updated the autonomous agent harness, architecture, product specs, frontend, design, security, tooling, and schema docs for the new B2B AI dataset marketplace direction.
- Moved architecture guidance from root `ARCHITECTURE.md` to `docs/ARCHITECTURE.md`.
- Replaced old workflow docs with `docs/product-specs/marketplace-operations.md`, `docs/product-specs/service-tiers.md`, and `docs/design-docs/admin-dashboard.md`.
- Removed obsolete active planning for retired dashboard workflow gaps and archived completed active phase files.
- Added `TD-011` to track the remaining legacy code/schema replatforming work before marketplace relaunch.

## Product Direction Captured
- Current deployment remains landing page, contact form, and blog.
- Future marketplace is company-to-company: supplier companies offer data, buyer companies acquire ML-ready datasets, and Caudals intermediates sourcing, licensing, preprocessing, cleaning, curation, labeling, QA, and delivery.
- Individual user sample-upload workflows are no longer part of the product.

## Market Research Added
- Documented marketplace pricing patterns: subscription, usage-based, private offers, and custom quotes.
- Documented service-tier planning ranges for feasibility studies, pilot dataset builds, and complete dataset builds.
- Included public benchmark references from AWS Data Exchange, Snowflake Marketplace, Google Cloud Marketplace, Monda/Datarade, AWS SageMaker Ground Truth, PixlData, Data Consulting Firms, and AITrainingData.ai.

## Validation
- See `docs/logs/validations/2026-04-18-b2b-marketplace-pivot-docs-validation.md`.
