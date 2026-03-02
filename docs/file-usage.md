# File Usage Guide for Agents

## Root Files
| File | Read When | Write When |
| --- | --- | --- |
| `AGENTS.md` | Start of every non-trivial session | Agent protocol changes |
| `ARCHITECTURE.md` | Designing implementation approach | Architecture contracts change |

## Docs Subfolders
| Path | Purpose | Update Trigger |
| --- | --- | --- |
| `docs/PLAN.md` | Global execution queue and phase lifecycle | Queue or phase lifecycle changes |
| `docs/DESIGN.md` / `docs/FRONTEND.md` | UI/UX implementation and validation contracts | Design/frontend contract changes |
| `docs/SECURITY.md` / `docs/RELIABILITY.md` / `docs/QUALITY_SCORE.md` | Security/reliability/quality release gates | Policy or scoring changes |
| `docs/PRODUCT_SENSE.md` | Product prioritization and KPI direction | Product strategy updates |
| `docs/README.md` | Project setup and operational onboarding | Setup/deploy workflow changes |
| `docs/exec-plans/active/` | Current phase execution details (living plan files) | During active task progress and whenever scope/task breakdown changes mid-phase |
| `docs/exec-plans/completed/` | Historical completed phases | On phase completion only |
| `docs/exec-plans/tech-debt-tracker.md` | Deferred debt backlog | When debt is introduced/resolved |
| `docs/product-specs/` | Product behavior contracts | Product requirements change |
| `docs/design-docs/` | Design system and IA contracts | UX behavior or visual contracts change |
| `docs/generated/` | Generated snapshots | After regeneration event |
| `docs/logs/changelog/` | What was done and why | On meaningful completion |
| `docs/logs/validations/` | Validation evidence | After verification run |
| `docs/references/legacy/` | Historical docs for context | Rarely; preserve as archive |

## Required Write Sequence Per Completed Task
1. Update task checkbox/status in active phase file.
2. Append completion record in changelog.
3. Append verification details in validation log.
4. Update debt tracker if tradeoffs remain.

## Mid-Execution Plan Steering
1. When execution reveals missing scope, edit the current active phase file first.
2. Add/adjust tasks or subtasks with correct priority and status tags.
3. Continue implementation against the updated plan and then follow the completed-task write sequence above.
