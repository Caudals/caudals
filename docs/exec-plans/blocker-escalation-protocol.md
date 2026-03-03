# Blocker Escalation and Retry Protocol

Use this protocol when a task cannot progress cleanly (tool outage, failing environment, dependency gap, or risk boundary).

## Purpose

- Keep long-running execution moving without silent stalls.
- Standardize retry behavior for transient failures.
- Make blocker state visible in phase plans and logs.

## Blocker Classes

1. `TRANSIENT_TOOLING`: MCP transport errors, temporary CLI/tool failures.
2. `ENVIRONMENT`: local dev server/runtime failures, missing fixtures, flaky test infra.
3. `DEPENDENCY`: missing credentials/access, upstream API downtime, required reviewer input.
4. `HIGH_RISK`: action is irreversible/destructive without explicit approval.
5. `CONFLICTING_REQUIREMENTS`: requirements conflict and cannot be resolved from repo context.

## Retry Strategy (Long-Running Tasks)

Before marking a task `BLOCKED`, execute this retry sequence unless the blocker is `HIGH_RISK`:

1. Attempt 1 (immediate):
- Re-run command/tool once and capture exact error output.
- Apply one low-risk local fix (for example: restart dev server, reseed fixtures, retry MCP session).

2. Attempt 2 (short backoff):
- Wait `2-5` minutes.
- Retry with a fallback path if available (for example: Playwright evidence when Chrome MCP is down).

3. Attempt 3 (final bounded retry):
- Perform one final retry after targeted isolation (narrowed command, scoped test, or minimal reproduction).
- If still failing, escalate and mark task `BLOCKED`.

## Mandatory Escalation Record

When retries are exhausted (or immediate escalation is required):

1. Update the active phase task status to `BLOCKED` with:
- timestamp (`YYYY-MM-DD`),
- blocker class,
- failure symptom,
- retries attempted,
- next required input/action to unblock.

2. Add a dated changelog note in `docs/logs/changelog/` with blocker summary.
3. Add a validation note in `docs/logs/validations/` containing commands, errors, and fallback attempts.
4. If user input is required, ask one concise unblock question in the main thread.

## Resume Protocol

When blocker is resolved:

1. Change task state from `BLOCKED` to `IN_PROGRESS`.
2. Add one-line unblock note (what changed and why execution can continue).
3. Re-run the minimum validation for the affected scope.
4. Only then mark task `DONE`.

## Stop-Condition Alignment

Pause immediately (no retries) only when:
- credentials/access are unavailable,
- requirements conflict cannot be resolved from repository context,
- next action is irreversible and high risk.
