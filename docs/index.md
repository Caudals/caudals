# Docs Index and Usage Contract

This directory is the persistent operating memory for long-horizon autonomous delivery.

## Structure
- `PLAN.md`: active queue, phase lifecycle, exec-plans directory contract, execution priorities.
- `DESIGN.md`: design governance and quality bar.
- `FRONTEND.md`: frontend implementation + i18n + UI validation contract.
- `SECURITY.md`: security and compliance non-negotiables.
- `TOOLS.md`: operational tooling, MCP usage, setup commands, and troubleshooting.
- `exec-plans/`: active/completed phases, templates, and execution protocols.
- `product-specs/`: startup context, product contracts, and role workflows.
- `generated/`: generated snapshots (schema inventory).
- `references/`: supporting harness references.
- `logs/`: changelog and validation evidence.

## Read/Write Matrix
| Path | Purpose | Update Trigger |
| --- | --- | --- |
| `AGENTS.md` | global autonomous operating contract | only when harness protocol changes |
| `ARCHITECTURE.md` | technical system contract and deployment/runtime model | architecture/runtime changes |
| `docs/PLAN.md` | global queue and planning lifecycle | active queue/status/lifecycle updates |
| `docs/DESIGN.md`, `docs/FRONTEND.md` | UX/front-end constraints and validation expectations | design/frontend contract changes |
| `docs/SECURITY.md` | security/compliance baseline | security controls or policy changes |
| `docs/TOOLS.md` | operational tooling and setup runbook | tooling workflows/setup/troubleshooting changes |
| `docs/exec-plans/active/*.md` | living implementation plan for in-flight phases | continuously during execution |
| `docs/exec-plans/completed/*.md` | immutable phase history | only when moving completed phase file |
| `docs/exec-plans/tech-debt-tracker.md` | unresolved debt queue | debt introduced/resolved |
| `docs/product-specs/*.md` | product behavior contracts and startup context | behavior/product contract changes |
| `docs/generated/*.md` | generated technical snapshots | regeneration events |
| `docs/logs/changelog/*.md` | dated record of delivery outcomes | meaningful completion |
| `docs/logs/validations/*.md` | dated validation evidence | after validation runs |

## Required Write Sequence Per Completed Task
1. Update task checkbox/status in the active phase file.
2. Add a dated entry in `docs/logs/changelog/`.
3. Add validation evidence in `docs/logs/validations/`.
4. Update `docs/exec-plans/tech-debt-tracker.md` if unresolved tradeoffs remain.

## Active-Plan Steering Rule
When discovery reveals missing scope, update the active phase plan first (stages/tasks/subtasks/priority/status), then continue implementation.

## Governance Canon
`docs/PLAN.md` is the canonical governance source for planning lifecycle, queue order, completion protocol, and exec-plans structure.
