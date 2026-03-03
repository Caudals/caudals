# Weekly Planning Reset Cadence

This cadence prevents stale queues and keeps active phase files execution-ready.

## Cadence

- Run once per week on the first active session of the week.
- Also run immediately after closing a major phase.

## Reset Checklist (15-30 minutes)

1. Queue integrity:
- Verify `docs/PLAN.md` reflects current active/completed phases.
- Verify `docs/exec-plans/active/index.md` ordering matches task priorities.

2. Active phase hygiene:
- Ensure each active phase has accurate task statuses (`QUEUED`, `IN_PROGRESS`, `BLOCKED`, `DONE`).
- Convert stale `IN_PROGRESS` tasks with no recent evidence into `BLOCKED` with explicit reason and unblock criteria.

3. Evidence completeness:
- Confirm each newly `DONE` task has matching changelog and validation entries.
- Ensure validation links in phase files resolve.

4. Debt triage:
- Review `docs/exec-plans/tech-debt-tracker.md`.
- Assign target phase and priority for new or unresolved debt.

5. Priority refresh:
- Re-rank unblocked tasks by impact and dependencies.
- Update queue position fields inside active phase files as needed.

## Output Artifacts

After each reset, update:

- `docs/PLAN.md`
- `docs/exec-plans/active/index.md`
- affected active phase file(s)
- one dated note in `docs/logs/changelog/` summarizing the reset

## Rules

- Treat active phase files as living documents; adjust scope before implementation when discovery reveals missing work.
- Do not move a phase file to `completed/` until all active-scope tasks are finished and validated.
