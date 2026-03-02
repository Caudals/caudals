# 2026-03-02 App Dashboard Refactor (Phase 13)

## Scope

Executed Phase 13 requester-first dashboard refactor and shared app shell stabilization for `app.caudals.com`.

## Completed

- Added role blueprint contracts for requester/contributor/admin in `docs/design-docs/dashboard-role-blueprints.md`.
- Activated phase tracking in `docs/exec-plans/active/phase-13-app-dashboard-refactor.md` and queued it in `docs/PLAN.md`.
- Refactored shared sidebar architecture:
  - role-aware IA and grouped menus by role
  - deterministic path + query active-state matching
  - admin role switcher moved to top-zone and stabilized
  - consistent utility links by active view
- Fixed auth/role drift behavior:
  - removed unsafe `contributor` fallback in `AuthProvider`
  - preserved role state when role API fetch fails
- Enabled admin viewing of contributor surfaces by updating contributor route guard to allow `admin`.
- Refactored requester section UX and page consistency:
  - overview dashboard
  - datasets index
  - analytics
  - billing
  - files/exports
  - onboarding
  - settings
  - support list/detail
  - dataset create/edit headers
- Added/updated reusable requester header component for cohesive page framing.
- Updated authenticated Playwright smoke test assertion to match the new requester datasets heading.

## Notable Outcome

- Admin role switching now reliably lands on and stays in selected views (`admin`, `requester`, `contributor`) without accidental redirect loops.
- Query-driven sidebar routes (e.g. review queue filters) now highlight correctly.

## Completion Pass (Contributor + Admin)

- Refactored contributor dashboard IA and page framing for market-ready consistency:
  - introduced unified contributor role header styling and action slots
  - updated contributor `overview`, `contributions`, `earnings`, and `settings` pages with cohesive hero framing and top-level actions
  - removed mixed legacy layout wrappers (`p-6` nested shells) in contributor pages to align with app shell spacing contract
- Refactored admin dashboard IA and section framing:
  - added reusable `components/admin/admin-page-header.tsx`
  - applied consistent admin section framing and action affordances across `overview`, `requests`, `submissions`, `datasets`, `payments`, `support`, `users`, `analytics`, `activity`, `featured`, and `settings`
  - aligned section naming, copy, and task-entry buttons to operational flows (moderation, operations, intelligence, governance)
- Updated authenticated E2E expectation for contributor dashboard heading to include the new command-center title.
