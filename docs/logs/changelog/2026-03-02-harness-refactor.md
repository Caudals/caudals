# 2026-03-02 Harness Refactor

## Scope
Refactored repository documentation into a harness-engineering structure for autonomous long-running execution.

## Completed
- Added root harness docs: `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, `DESIGN.md`, `FRONTEND.md`, `PRODUCT_SENSE.md`, `QUALITY_SCORE.md`, `RELIABILITY.md`, `SECURITY.md`.
- Created docs architecture:
  - `docs/design-docs/`
  - `docs/exec-plans/active/`
  - `docs/exec-plans/completed/`
  - `docs/generated/`
  - `docs/product-specs/`
  - `docs/references/`
  - `docs/logs/`
- Migrated existing key sources:
  - `design-system.md` -> `docs/design-docs/ui-ux-design-system.md`
  - `project-tracker.md` -> `docs/exec-plans/completed/phase-00-to-10-legacy-tracker.md`
  - `caudals-context.md` -> `docs/references/legacy/caudals-context-legacy.md`
- Organized prior standalone docs under `docs/references/legacy/`.

## Notes
This refactor establishes explicit phase files, queueing, and validation logging required for autonomous agent loops.
