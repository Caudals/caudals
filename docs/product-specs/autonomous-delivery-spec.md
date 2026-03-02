# Autonomous Delivery Spec

## Goal
Enable agents to continuously deliver product improvements without manual step-by-step supervision.

## Execution Contract
1. Plan from active phase files.
2. Implement small coherent increments.
3. Validate code, behavior, and UI evidence.
4. Document outcomes in logs.
5. Continue with next queued task.

## Validation Requirements
- Backend: tests and type checks for affected modules.
- Frontend: Chrome DevTools MCP validation and screenshots.
- Data: schema/policy checks for DB-impacting changes.

## Evidence Requirements
Every completed task must include:
- changed files summary,
- command/test outcomes,
- UI evidence for visual changes,
- risk or debt notes if any.
