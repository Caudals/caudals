# Phase Template (Required For New Phases)

Use this template when creating any new phase file in `docs/exec-plans/active/`.

```md
# Phase <NN> - <Title>

- Status: IN_PROGRESS
- Priority: P0
- Owner: agent
- Last Updated: YYYY-MM-DD

## Goal
- <What this phase delivers and why now>

## Exit Criteria
- <Clear testable completion conditions>

## Queue
- Queue Position: <n>
- Blocking Dependencies: <none | list>

## Scope Context
- <Background bullets>
- <Constraints/assumptions>
- <Known risks>

## Stages

### S1 - <Stage name>
- Objective:
- Outputs:
- Done when:
- Mapped Tasks: `P<NN>-T01`, `P<NN>-T02`

### S2 - <Stage name>
- Objective:
- Outputs:
- Done when:
- Mapped Tasks: `P<NN>-T03`

## Tasks
- [ ] `P<NN>-T01` (P0, QUEUED, owner: agent) <task summary>
- [ ] `P<NN>-T02` (P1, QUEUED, owner: agent) <task summary>

## Subtasks (Optional)
- [ ] `P<NN>-T01-S01` <subtask summary>

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- runtime/manual checks relevant to scope

## Evidence Links
- Changelog: `docs/logs/changelog/YYYY-MM-DD-<topic>.md`
- Validation: `docs/logs/validations/YYYY-MM-DD-<topic>.md`

## Mid-Execution Steering Notes
- Add newly discovered tasks/subtasks directly in this file.
- If stage scope changes, update stage definitions and mapped task IDs in the same edit.
```
