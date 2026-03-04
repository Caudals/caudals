# Caudals Design Governance

## Objective
Guarantee a coherent, production-grade experience across marketing, auth, requester, contributor, and admin surfaces.

## Canonical Design Sources
1. `docs/design-docs/ui-ux-design-system.md`
2. `docs/design-docs/dashboard-role-blueprints.md`

## Design Contracts
- Light mode only in current delivery scope.
- Canonical requester IA is `/requester/*`.
- Role shells must share structure, not look interchangeable.
- Every workflow must expose explicit loading/empty/error/success states.
- Trust signals (status, review state, payout state, risk cues) must stay visible.

## UI Skill Requirement
For frontend UI tasks, use the local `frontend-design` skill and preserve existing Caudals visual language.

## Quality Gate
UI work is complete only when:
- token and primitive contracts are respected,
- accessibility checks pass (keyboard/focus/readability),
- responsive checks pass (mobile/tablet/desktop),
- evidence is logged in `docs/logs/validations/` following `docs/exec-plans/ui-verification-protocol.md`.
