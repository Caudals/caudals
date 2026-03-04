# Phase 18 - Comprehensive Design System Refactor (Mintlify-Inspired)

- Status: DONE
- Priority: P1
- Owner: agent
- Last Updated: 2026-03-04

## Goal
- Completely overhaul the visual language of the platform to match a modern, airy, Mintlify-inspired aesthetic. This involves moving away from heavy borders/shadows to pure white content areas, subtle gray sidebars, clean typography, and distinctive green accents, while maintaining existing functionality.

## Exit Criteria
- Landing pages reflect the new design system (clean cards, correct typography, subtle grid/wireframe assets) while retaining the specified layout (centered hero, glassmorphism top-nav, right-aligned nav items).
- Shared app shell (sidebar, topbar) matches the Mintlify-style contract: very subtle/no borders, light gray background for the shell, pure white for the main content area, active items highlighted with a soft green pill.
- Requester, Contributor, and Admin dashboards are refactored to use the new tokens, components (e.g., minimal horizontal-line tables, soft-bordered cards), and updated typography hierarchy.
- All refactored pages remain responsive and accessible.

## Queue
- Queue Position: 2 (After Phase 17)
- Blocking Dependencies: None

## Scope Context
- The design system overhaul changes *how* data is displayed, not *what* data is displayed. Feature logic should remain intact.
- The new design system is documented in `docs/design-docs/ui-ux-design-system.md`.
- Marketing site layout decisions (glassmorphism, centered hero) are protected; only styling tokens and component aesthetics should change.

## Stages

### S1 - Global Foundation & Shell Refactor
- Objective: Update global CSS variables, Tailwind config, and the shared app shell to match the new design language.
- Outputs: Updated `globals.css`, `tailwind.config.ts`, `app-shell.tsx`, `app-sidebar.tsx`, `app-header.tsx`.
- Done when: Global tokens are in place and the app skeleton reflects the light gray/white canvas split with soft green active states.
- Mapped Tasks: `P18-T01`, `P18-T02`

### S2 - Marketing & Landing Page Polish
- Objective: Apply the new design system to public marketing routes (`/`, `/about`, `/pricing`, etc.).
- Outputs: Refactored components in `app/(home)/*` and `components/landing/*`.
- Done when: Landing page uses clean fonts, soft borders, green accents, whilst retaining the glassmorphism top nav and centered hero structure.
- Mapped Tasks: `P18-T03`

### S3 - Requester Dashboard Refactor
- Objective: Implement the new design system across all Requester views.
- Outputs: Refactored tables, cards, and forms in `app/(app)/requester/*`.
- Done when: Requester specific pages (`/requester`, `/requester/datasets`, etc.) follow the clean, minimal-border UI contract.
- Mapped Tasks: `P18-T04`, `P18-T05`

### S4 - Contributor Dashboard Refactor
- Objective: Implement the new design system across all Contributor views.
- Outputs: Refactored views for opportunity browsing and earnings in `app/(app)/contributor/*` and `components/browse/*`.
- Done when: Browse and Contributor dashboards reflect the new aesthetic.
- Mapped Tasks: `P18-T06`, `P18-T07`

### S5 - Admin Dashboard Refactor
- Objective: Implement the new design system across complex Admin views.
- Outputs: Refactored high-density tables and stat cards in `app/(app)/admin/*` and `components/admin/*`.
- Done when: Admin interfaces are clean, readable, and free of zebra-striping or heavy borders.
- Mapped Tasks: `P18-T08`, `P18-T09`

### S6 - Cross-cutting Polish & Validation
- Objective: Verify responsiveness, accessibility, and visual consistency across all viewports and roles.
- Outputs: Bug fixes, minor UI tweaks, validation logs.
- Done when: E2E and visual tests confirm the new UI is stable and completely replaces the old design system.
- Mapped Tasks: `P18-T10`

## Tasks

- [x] `P18-T01` (P1, DONE, owner: agent) Update `globals.css` and `tailwind.config.ts` with new color tokens (Emerald accents, gray-50 backgrounds) and typography settings.
- [x] `P18-T02` (P1, DONE, owner: agent) Refactor `app-sidebar.tsx`, `app-shell.tsx`, and `app-header.tsx` to remove heavy borders, set canvas/surface backgrounds, and update active link styles (soft green pill). Update Command-K search bar to be prominent with a light gray background.
- [x] `P18-T03` (P1, DONE, owner: agent) Refactor landing page (`app/(home)/page.tsx`) & marketing components. Maintain glassmorphism nav and centered hero, but apply new tokenized cards, subtle grids, and green wireframe illustration aesthetics.
- [x] `P18-T04` (P1, DONE, owner: agent) Refactor Requester Overview (`/requester`) and Dataset Creation flows to use new card/form aesthetics (generous padding, soft borders).
- [x] `P18-T05` (P1, DONE, owner: agent) Refactor Requester Datasets list & Files views. Ensure tables use horizontal dividers only, clean header styling, and subtle status chips.
- [x] `P18-T06` (P1, DONE, owner: agent) Refactor Contributor Browse opportunities (`/browse`). Update opportunity cards to be clean, pure white with soft borders and clear typography hierarchy.
- [x] `P18-T07` (P1, DONE, owner: agent) Refactor Contributor Dashboard (`/contributor`, `/contributor/earnings`, `/contributor/contributions`). Update progress trackers and payout cards.
- [x] `P18-T08` (P1, DONE, owner: agent) Refactor Admin Overview (`/admin`) and SLAs/Queues. Update KPI cards to use the new simple metric layout without heavy shadows.
- [x] `P18-T09` (P1, DONE, owner: agent) Refactor dense Admin tables (Requests, Submissions, Users, Payments). Ensure readable typography (`text-gray-900` vs `text-gray-500`) and minimal horizontal borders.
- [x] `P18-T10` (P1, DONE, owner: agent) Run visual regression checks, ensure responsive layouts (mobile drawer/sidebar) function correctly with the new aesthetic, and resolve any contrast issues.

## Subtasks (Optional)
- [x] `P18-T02-S01` Implement breadcrumbs in the new topbar layout if missing.
- [x] `P18-T05-S01` Standardize all empty states across tables to follow the "one click away from recovery" rule with the new design.
- [x] `P18-T09-S01` Standardize pagination controls to match the clean aesthetic.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- runtime/manual checks relevant to scope via Chrome DevTools MCP

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-04-phase-18-design-system-refactor.md`
- Validation: `docs/logs/validations/2026-03-04-phase-18-design-system-validation.md`
