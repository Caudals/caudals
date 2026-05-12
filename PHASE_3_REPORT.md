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

## Verification

- Focused buyer workspace tests, full Vitest, typecheck, lint, i18n parity, production build, migration/rollback validation, disposable fixture seed, and authenticated local role smoke passed.
- Live Postgres readback after `018_buyer_workspace_v1.sql` confirmed seven new buyer workspace columns and one buyer-scoped row each for subscription, invoice, and delivery integration fixtures.
- Supplier Portal v1 focused tests, full Vitest, typecheck, lint, i18n parity, production build, migration/rollback validation, disposable fixture seed, and authenticated local role smoke passed. Disposable readback confirmed one supplier payout, one supplier payout integration, and one Stripe Connect fixture row.
- Supplier Portal v1 live migration, deployment, and production smoke are pending for this slice.

## Known Gaps / Next M3 Inputs

- Document and time-series modality coverage at production quality.
- SOC 2 Type I / ISO 27001 scoping, EU AI Act Article 10 documentation generation, Croissant defaults, and HF mirror channel.
