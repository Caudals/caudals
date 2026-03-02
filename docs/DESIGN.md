# Caudals Design Governance

## Objective
Guarantee a coherent, production-grade product experience across marketing, auth, requester, contributor, and admin surfaces.

## Primary Design Sources
1. `docs/design-docs/core-beliefs.md`
2. `docs/design-docs/ui-ux-design-system.md`
3. `docs/design-docs/dashboard-ia-spec.md`
4. `docs/design-docs/dashboard-ui-spec.md`

## Design Contracts
- Light mode only for current phase.
- Canonical requester IA under `/requester/*`.
- Shared shell language (sidebar, panel, spacing rhythm) across all roles.
- Explicit states required: loading, empty, error, success.
- All UI work must include responsive checks (mobile/tablet/desktop).

## Quality Gate
A UI task is done only when:
- design tokens are respected,
- interaction/accessibility checks pass,
- screenshots/validation are logged in `docs/logs/validations/`.
