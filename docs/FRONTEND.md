# Frontend Delivery Contract

## Scope
Defines implementation and validation rules for frontend work across web app, marketing, auth, and PWA surfaces.

## Stack and Constraints
- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope
- Preserve role boundaries (`/requester`, `/contributor`, `/admin`)

## Routing and IA Contract
- `/dashboard` is only a role-aware entrypoint.
- Canonical requester workspace is `/requester/*`.
- Do not introduce new requester workflows under legacy `/dashboard/*` paths.

## Localization Contract
- Supported locales: `en` and `es`.
- Locale cookie: `NEXT_LOCALE`.
- Middleware locale detection can use country headers, `Accept-Language`, and IP geolocation fallback.
- Spain (`ES`) is treated as a strong signal for Spanish locale routing.
- Use translation pipeline (`t()`, `getServerTranslator()`, `translateReactNode`) for all user-visible strings.
- Do not ship new hardcoded user-facing English strings in app/marketing/auth/PWA components.
- Spain locale (`ES`) should resolve naturally to Spanish copy.

## Implementation Rules
1. Start from existing design tokens and shared primitives.
2. Keep route ownership clear by role.
3. Prefer incremental, verifiable UI changes.
4. Avoid parallel component systems.
5. Preserve keyboard/focus behavior while restyling.

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
