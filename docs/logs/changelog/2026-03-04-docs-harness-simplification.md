# 2026-03-04 - Docs Harness Simplification

## Summary
Simplified the autonomous-agent documentation system to reduce drift and duplicated guidance while preserving startup/product/tooling context.

## What Changed
- Consolidated core harness governance into canonical files:
  - `AGENTS.md`
  - `docs/index.md`
  - `docs/PLAN.md`
- Reworked architecture/spec/tooling docs to absorb legacy context and remove stale references:
  - `ARCHITECTURE.md`
  - `docs/README.md`
  - `docs/TOOLS.md`
  - `docs/product-specs/platform-overview.md`
  - `docs/product-specs/role-workflows.md`
  - `docs/product-specs/autonomous-delivery-spec.md`
  - `docs/product-specs/index.md`
- Simplified design governance and removed overlapping design specs:
  - updated `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/design-docs/index.md`
  - updated `docs/design-docs/ui-ux-design-system.md`
  - updated `docs/design-docs/dashboard-role-blueprints.md`
- Deduplicated `exec-plans` governance docs:
  - updated `docs/exec-plans/README.md`
  - updated `docs/exec-plans/active/index.md`
  - updated `docs/exec-plans/phase-template.md`
  - updated `docs/exec-plans/weekly-planning-reset.md`
- Updated `docs/logs/index.md` after removing obsolete metrics artifact.

## Removed Files
- `docs/RELIABILITY.md`
- `docs/QUALITY_SCORE.md`
- `docs/PRODUCT_SENSE.md`
- `docs/file-usage.md`
- `docs/references/legacy/caudals-context-legacy.md`
- `docs/logs/metrics/dashboard-usability-checks.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/dashboard-ia-spec.md`
- `docs/design-docs/dashboard-ui-spec.md`
- `docs/design-docs/ux-role-discovery.md`

## Notes
Historical records in `docs/logs/**` and completed phase archives remain untouched.
