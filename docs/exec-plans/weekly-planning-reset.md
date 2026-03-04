# Weekly Planning Reset

Run this checklist once per week (or immediately after closing a major phase) to keep execution artifacts fresh.

## Checklist
1. Queue integrity
- `docs/PLAN.md` reflects current active/completed phases.
- `docs/exec-plans/active/index.md` reflects active files.

2. Active phase hygiene
- task statuses are current (`QUEUED`, `IN_PROGRESS`, `BLOCKED`, `DONE`)
- stale `IN_PROGRESS` tasks are converted to `BLOCKED` with unblock criteria

3. Evidence completeness
- each new `DONE` task has changelog + validation entries
- evidence links in active phase files resolve

4. Debt triage
- review/update `docs/exec-plans/tech-debt-tracker.md`

5. Priority refresh
- re-rank unblocked tasks by impact and dependencies

## Output Artifacts
After reset, update:
- `docs/PLAN.md`
- `docs/exec-plans/active/index.md`
- affected active phase file(s)
- one dated note in `docs/logs/changelog/`
