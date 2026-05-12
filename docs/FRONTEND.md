# Frontend Delivery Contract

## Scope
Defines implementation rules for frontend work across the public funnel, internal admin dashboard, and future B2B marketplace surfaces.

## Stack and Constraints
- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope
- Current public deployment is landing mode: `/`, `/contact`, `/blog`, `/blog/*`
- `/catalogue` is the explicitly relaunched M3 public catalogue subset; it is read-only and routes access requests to `/contact`
- Keep marketplace, supplier, and hidden authenticated routes unavailable until explicitly relaunched
- `/buyer` is the explicitly relaunched buyer surface and is limited to read-only delivery, subscription, integration, billing, scorecard, manifest, and trust evidence review
- `/supplier` is the explicitly relaunched M2 supplier surface and is limited to managed asset declaration, signed sample upload, and build participation review

## Routing and IA Contract
- `LANDING_MODE=true` is the canonical production posture until further notice.
- Public navigation should expose Catalogue, Contact, and Blog while landing mode remains active.
- `/contact` is the M3 public buyer-brief intake surface as well as the general contact path. Buyer-focused submissions should keep the same quiet form treatment, capture structured dataset requirements, and avoid exposing broader self-serve purchase flows.
- Do not add new company-facing workflows under hidden app routes.
- The internal admin dashboard, `/buyer` read-only buyer workspace, and `/supplier` managed supplier portal are the only authenticated surfaces that should be preserved in the near term.
- Broader buyer/supplier self-service requires a new IA and schema direction before implementation.

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
6. Keep new B2B workflows centered on buyer demand capture, supplier data monetization, dataset operations, and internal admin control.

## Runtime Review
For frontend changes, use the level of inspection appropriate to the risk of the change:
- local type and lint checks for code edits,
- browser/devtools inspection for changed routes,
- console and network review for changed interaction paths,
- viewport review when layout or responsive behavior changes.
