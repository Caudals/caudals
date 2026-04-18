# Frontend Delivery Contract

## Scope
Defines implementation and validation rules for frontend work across the public funnel, internal admin dashboard, and future B2B marketplace surfaces.

## Stack and Constraints
- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope
- Current public deployment is landing mode: `/`, `/contact`, `/blog`, `/blog/*`
- Keep marketplace, buyer, supplier, and legacy authenticated routes hidden until explicitly relaunched

## Routing and IA Contract
- `LANDING_MODE=true` is the canonical production posture until further notice.
- Public navigation should expose only Contact and Blog unless the user explicitly requests another public route.
- Do not add new company-facing workflows under legacy app routes.
- The internal admin dashboard is the only authenticated surface that should be preserved in the near term.
- Future buyer/supplier workspaces require a new IA and schema plan before implementation.

## Localization Contract
- Supported locales: `en` and `es`.
- Locale cookie: `NEXT_LOCALE`.
- Middleware locale detection can use country headers, `Accept-Language`, and IP geolocation fallback.
- Spain (`ES`) is treated as a strong signal for Spanish locale routing.
- Use translation pipeline (`t()`, `getServerTranslator()`, `translateReactNode`) for all user-visible strings.
- Do not ship new hardcoded user-facing English strings in public or admin components.
- Spain locale (`ES`) should resolve naturally to Spanish copy.

## Implementation Rules
1. Start from existing design tokens and shared primitives.
2. Keep current public routes aligned with landing-mode restrictions.
3. Prefer incremental, verifiable UI changes.
4. Avoid parallel component systems.
5. Preserve keyboard/focus behavior while restyling.
6. Do not reuse retired individual upload or old request/review assumptions in new B2B flows.

## Validation Rules
For each frontend task:
1. Run `npm run typecheck`.
2. Run targeted lint/tests for touched files.
3. Use Chrome DevTools MCP to verify:
   - no new console errors,
   - no new failed network requests,
   - critical interaction path works end-to-end,
   - screenshots for required viewports.
4. Record evidence in `docs/logs/validations/`.
