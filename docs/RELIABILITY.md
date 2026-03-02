# Reliability Contract

## Goals
- Predictable releases
- Fast detection of regressions
- Safe rollback and recovery

## Required Engineering Practices
1. Keep CI gates green (`lint`, `typecheck`, tests, smoke E2E).
2. Treat payment/moderation/data flows as high-risk paths requiring explicit validation.
3. Keep runbooks and parity checklists current.
4. Use changelog + validation logs as operational evidence.

## Operational References
- `docs/references/legacy/staging-parity-checklist.md`
- `docs/references/legacy/db-runbook.md`
- `docs/references/legacy/performance-budgets.md`
- `docs/logs/validations/`
