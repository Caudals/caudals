# UI Verification Protocol

Mandatory for frontend tasks across public landing/contact/blog surfaces, internal admin surfaces, and future B2B marketplace surfaces.

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

`YYYY-MM-DD-<surface>-<state>.png`

Examples:

- `2026-04-18-landing-hero-desktop.png`
- `2026-04-18-contact-form-mobile.png`
- `2026-04-18-admin-leads-empty.png`

## Evidence Storage

- Store screenshots in `docs/logs/validations/`.
- Add command outputs and QA notes in a dated markdown file in `docs/logs/validations/`.
- Link both changelog and validation file paths from the active phase file evidence section.

## Contingency

- If Chrome DevTools MCP transport is unavailable, capture equivalent evidence with Playwright and explicitly note the MCP outage and fallback method in validation logs.
