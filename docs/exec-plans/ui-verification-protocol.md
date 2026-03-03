# UI Verification Protocol

Mandatory for frontend tasks across requester, contributor, and admin surfaces.

## Tooling Requirement

- Primary workflow: Chrome DevTools MCP.
- Required checks in each run:
  - browser console (no new runtime errors),
  - network panel (no new failed requests caused by the change),
  - critical user interaction path for the touched area,
  - screenshots for required viewports.

## Required Viewports

- Mobile: `390x844`
- Tablet: `834x1112`
- Desktop: `1440x900` (or wider desktop equivalent used in QA)

## Screenshot Naming Convention

Use:

`YYYY-MM-DD-<role>-<surface>-<state>.png`

Examples:

- `2026-03-03-requester-dashboard-refactor.png`
- `2026-03-03-admin-dashboard-collapsed-refactor.png`
- `2026-03-03-contributor-dashboard-mobile-refactor.png`

## Evidence Storage

- Store screenshots in `docs/logs/validations/`.
- Add command outputs and QA notes in a dated markdown file in `docs/logs/validations/`.
- Link both changelog and validation file paths from the active phase file evidence section.

## Contingency

- If Chrome DevTools MCP transport is unavailable, capture equivalent evidence with Playwright and explicitly note the MCP outage and fallback method in validation logs.
