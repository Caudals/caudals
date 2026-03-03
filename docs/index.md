# Docs Index

This directory is organized for long-horizon autonomous execution.

## Structure
- `file-usage.md`: explicit read/write behavior for each harness file.
- `design-docs/`: design beliefs, design system, IA/UI specifications.
- `exec-plans/`: active/completed phase plans and tech debt tracker.
- `generated/`: generated snapshots (schema, inventories).
- `product-specs/`: product requirements and role workflows.
- `references/`: tooling references plus legacy supporting docs.
- `logs/`: changelogs, validations, QA evidence.

## How Agents Should Use This
1. Pick phase from `docs/exec-plans/active/index.md`.
2. For new phases, start from `docs/exec-plans/phase-template.md` and include stage-based breakdown plus tasks/subtasks.
3. Execute tasks and treat the selected active phase file as a living document.
4. If execution reveals extra scope, extend/refine stages/tasks/subtasks in that same phase file before continuing.
5. Log outcomes in `docs/logs/changelog/` and `docs/logs/validations/`.
6. Keep product/design/security docs synchronized with behavior changes.
