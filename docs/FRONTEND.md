# Frontend Delivery Contract

## Scope
Defines how agents implement and verify frontend changes for Caudals.

## Stack and Constraints
- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- No dark mode expansion in this phase
- Preserve role-based shell and navigation boundaries

## Implementation Rules
1. Start from existing design tokens and shared primitives.
2. Keep route ownership clear by role (`/requester`, `/contributor`, `/admin`).
3. Prefer incremental UI changes that can be validated quickly.
4. Avoid introducing parallel component systems.

## Validation Rules
For each frontend task:
1. Run `npm run typecheck`.
2. Run targeted tests/lint for touched files.
3. Use Chrome DevTools MCP for manual verification:
- inspect console for runtime errors,
- inspect failed network requests,
- test critical interactions,
- capture screenshots for desktop and mobile.
4. Record evidence under `docs/logs/validations/`.
