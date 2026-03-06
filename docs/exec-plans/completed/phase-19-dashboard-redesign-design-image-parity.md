# Phase 19 - Cross-Role Dashboard Redesign With Design-Image Parity

- Status: IN_PROGRESS
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-06

## Goal
- Completely overhaul the UI/UX for all 3 dashboards (Admin, Contributor, Requester) using the `frontend-design` skill. 
- Ensure a professional, distinctive, production-grade aesthetic that avoids generic AI generated patterns.
- Ensure the design is consistent with reference images in `docs/design-docs/design-images/` while building an original, polished design system.
- Replace fake/duplicate information with useful features and metrics. Ensure sidebars are concise (no internal scrolling).

## Exit Criteria
- Every route in Admin, Contributor, and Requester dashboards is inspected, screenshotted, and refactored. Do not forget to visualize the screenshots before and after the redesign to iterate until you are satisfied with the result. You can also use chrome devtools MCP to see the changes.
- A distinctive design system and brand guidelines are established and applied.
- Analytics/metrics use a professional graphing library.
- No scrollbar present in sidebars.
- Fake/duplicate information removed from main dashboard pages.
- Missing features/workflows are identified and documented in a separate plan (Phase 20).

## Queue
- Queue Position: 1
- Blocking Dependencies: None

## Scope Context
- Rely on `frontend-design` skill instructions: bold aesthetic, distinctive typography, cohesive theme.
- The redesign covers light mode only (as per `docs/DESIGN.md`).
- Must preserve role boundaries and existing URL structures.
- Use `recharts` or another professional chart library for analytics.

## Stages

### S1 - Aesthetic Foundation & Brand Guidelines
- Objective: Define the visual direction, typography, colors, spatial composition, and graphing library selection.
- Outputs: Updated global CSS/Tailwind configuration, core UI components.
- Done when: Base aesthetic is applied to the root layout and shared primitives.
- Mapped Tasks: `P19-T01`

### S2 - Admin Dashboard Refactoring
- Objective: Inspect, screenshot, and refactor all Admin routes.
- Outputs: Redesigned Admin pages with professional layout, no scrollbar in sidebar, and real analytics.
- Done when: All Admin routes are refactored.
- Mapped Tasks: `P19-T02` through `P19-T13`

### S3 - Contributor Dashboard Refactoring
- Objective: Inspect, screenshot, and refactor all Contributor routes.
- Outputs: Redesigned Contributor pages focusing on earning tracking, browse loops, and contributions.
- Done when: All Contributor routes are refactored.
- Mapped Tasks: `P19-T14` through `P19-T18`

### S4 - Requester Dashboard Refactoring
- Objective: Inspect, screenshot, and refactor all Requester routes.
- Outputs: Redesigned Requester pages for dataset requests, billing, and analytics.
- Done when: All Requester routes are refactored.
- Mapped Tasks: `P19-T19` through `P19-T26`

## Tasks

### S1 - Aesthetic Foundation
- [x] `P19-T01` (P0, DONE, owner: agent) Establish core aesthetic direction, update global CSS, Tailwind config, and choose graphing library.

### S2 - Admin Routes (`/admin/*`)
- [x] `P19-T02` (P0, DONE, owner: agent) Inspect, screenshot, and refactor `/admin` (Main Page). Remove duplicate/fake data.
- [x] `P19-T03` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/activity`.
- [x] `P19-T04` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/analytics`. Implement professional graphs.
- [x] `P19-T05` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/datasets`.
- [x] `P19-T06` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/featured`.
- [x] `P19-T07` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/payments`.
- [x] `P19-T08` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/requests`.
- [x] `P19-T09` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/settings`.
- [x] `P19-T10` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/submissions`.
- [x] `P19-T11` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/support`.
- [x] `P19-T12` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/admin/users`.
- [x] `P19-T13` (P0, DONE, owner: agent) Refactor Admin Sidebar (Ensure no scrollbar, remove duplicate sections).

### S3 - Contributor Routes (`/contributor/*`)
- [x] `P19-T14` (P0, DONE, owner: agent) Inspect, screenshot, and refactor `/contributor` (Main Page). Make useful and professional.
- [x] `P19-T15` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/contributor/browse`.
- [x] `P19-T16` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/contributor/contributions`.
- [x] `P19-T17` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/contributor/earnings`.
- [x] `P19-T18` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/contributor/settings`.
- [x] `P19-T19` (P0, DONE, owner: agent) Refactor Contributor Sidebar (Ensure no scrollbar).

### S4 - Requester Routes (`/requester/*`)
- [x] `P19-T20` (P0, DONE, owner: agent) Inspect, screenshot, and refactor `/requester` (Main Page).
- [x] `P19-T21` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/analytics`.
- [x] `P19-T22` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/billing`.
- [x] `P19-T23` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/datasets`.
- [x] `P19-T24` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/files`.
- [x] `P19-T25` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/onboarding`.
- [x] `P19-T26` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/settings`.
- [x] `P19-T27` (P1, DONE, owner: agent) Inspect, screenshot, and refactor `/requester/support`.
- [x] `P19-T28` (P0, DONE, owner: agent) Refactor Requester Sidebar (Ensure no scrollbar).

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- Chrome DevTools MCP screenshots for all modified routes
- Verification of no new console errors or failed network requests.
- No scrollbars on sidebars verified on desktop viewports.

## Evidence Links
- Changelog: `docs/logs/changelog/YYYY-MM-DD-<topic>.md`
- Validation: `docs/logs/validations/YYYY-MM-DD-<topic>.md`

## Mid-Execution Steering Notes
- Missing features/workflows identified during inspection must be logged in `Phase 20 - Dashboard Feature Gaps and Missing Workflows`.
