# Frontend Delivery Contract

## Scope

Defines implementation rules for frontend work across the public funnel, internal admin dashboard, and future B2B marketplace surfaces.

## Stack and Constraints

- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope
- Current public deployment is landing mode: public pages are `/`, `/contact`, `/book`, `/blog`, and `/blog/*`. Primary marketing navigation surfaces Contact and Blog; `/book` is a public funnel page reachable by direct link and cross-linked from `/contact`.
- Landing mode is not a route-publication ban. `/buyer`, `/supplier`, `/security`, and `/v1/*` may be published and accessible by direct URL when protected by their normal auth, authorization, RLS, rate-limit, and audit controls.
- Landing mode must hide buyer, supplier, API, and security entry points from the landing page: no buttons, nav links, hero CTAs, marketing cards, sitemap promotion, or other public discovery paths unless explicitly requested.
- Catalogue datasets, public catalogue browsing, sample-preview catalogue flows, and catalogue purchase flows are out of scope for the current blueprint implementation.
- `/buyer` is the buyer surface and is limited to read-only delivery, subscription, integration, billing, scorecard, manifest, and trust evidence review.
- `/supplier` is the supplier surface and is limited to managed asset declaration, signed sample upload, build participation, revenue-share payout, and Stripe Connect status review.

## Routing and IA Contract

- `LANDING_MODE=true` is the canonical production posture until further notice.
- Public navigation exposes only Contact and Blog while landing mode remains active.
- `/contact` is the M3 public buyer-brief intake surface as well as the general contact path. Buyer-focused submissions should keep the same quiet form treatment, capture structured dataset requirements, and avoid exposing broader self-serve purchase flows.
- `/book` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var, mirrors the quiet `/contact` treatment, and renders an explicit fallback panel when no link is configured. Keep it out of the primary landing navigation but cross-linked from `/contact`.
- Do not add landing-page entry points to buyer, supplier, API, or security routes unless explicitly requested.
- `/buyer`, `/supplier`, `/security`, and `/v1/*` are allowed to be direct-route accessible in landing mode; verify their own access controls rather than blocking them through the landing-mode route gate.
- Broader buyer/supplier self-service and catalogue commerce require a future IA and schema direction before implementation.

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
2. Keep landing-page navigation aligned with landing-mode restrictions while preserving direct-route access for published buyer, supplier, API, and security surfaces.
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
