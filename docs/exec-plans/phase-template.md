# Phase Template (Required For New Phases)

Use this template when creating any new phase file in `docs/exec-plans/active/`.

## Header

```md
# Phase <NN> - <Title>

- Status: IN_PROGRESS
- Priority: P0
- Owner: autonomous-agent
- Last Updated: YYYY-MM-DD
```

## Goal

- What this phase delivers and why it matters now.

## Exit Criteria

- Clear, testable completion conditions for the phase.

## Queue

- Queue Position: <n>
- Blocking Dependencies: <none | list>

## Scope Context

- Background summary (2-6 bullets).
- Constraints/assumptions.
- Known risks to watch during execution.

## Stages

Define ordered stages before listing tasks. Stages should be concrete execution slices, not generic labels.

```md
## Stages

### S1 - Discovery and Design Lock
- Objective:
- Outputs:
- Done when:
- Mapped Tasks: `P<NN>-T01`, `P<NN>-T02`

### S2 - Core Implementation
- Objective:
- Outputs:
- Done when:
- Mapped Tasks: `P<NN>-T03`, `P<NN>-T04`

### S3 - Validation and Hardening
- Objective:
- Outputs:
- Done when:
- Mapped Tasks: `P<NN>-T05`
```

## Tasks

Use status + priority tags for every task.

```md
- [ ] `P<NN>-T01` (P0, QUEUED) <task summary>
- [ ] `P<NN>-T02` (P1, QUEUED) <task summary>
```

## Subtasks

```md
- [ ] `P<NN>-T01-S01` <subtask summary>
- [ ] `P<NN>-T01-S02` <subtask summary>
```

## Validation Required

- `npm run typecheck`
- targeted lint/tests for touched scope
- additional runtime/manual checks if relevant

## Evidence Links

- Changelog: `docs/logs/changelog/YYYY-MM-DD-<topic>.md`
- Validation: `docs/logs/validations/YYYY-MM-DD-<topic>.md`

## Mid-Execution Steering Notes

- Add newly discovered tasks/subtasks directly in this file.
- If stage scope changes, update stage definitions and mapped task IDs in the same edit.
