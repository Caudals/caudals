# Caudals Design Governance

## Objective
Guarantee a coherent, production-grade experience across the current public funnel and future B2B marketplace/admin surfaces.

## Canonical Design Sources
1. `docs/design-docs/ui-ux-design-system.md`

## Design Contracts
- Light mode only in current delivery scope.
- Current public pages must match the live landing page: editorial white space, black typography, teal accents, subtle gray structure, and minimal shadows.
- The marketplace must remain hidden until it is redesigned for B2B buyer/supplier workflows.
- Future internal admin screens must prioritize operational clarity over decorative density.
- Every workflow must expose explicit loading, empty, error, and success states.
- Trust signals such as rights, provenance, PII status, QA score, licensing state, buyer status, and delivery state must stay visible.

## UI Skill Requirement
For frontend UI tasks, use the local `frontend-design` skill and preserve existing Caudals visual language.

## Quality Gate
UI work is complete only when:
- token and primitive contracts are respected,
- accessibility checks pass (keyboard/focus/readability),
- responsive checks pass (mobile/tablet/desktop),
- evidence is logged in `docs/logs/validations/` following `docs/exec-plans/ui-verification-protocol.md`.
