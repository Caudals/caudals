# 2026-04-16 – Landing Hero Spline Ribbon Validation

## Scope

- Phase 32 task `P32-T18`
- Landing route `/` with Spanish locale
- Hero media replacement, dashboard mock preservation, and Spline ribbon positioning

## Automated Checks

- `npx eslint components/landing/hero.tsx components/landing/hero-spline-scene.tsx components/landing/home-page-client.tsx next.config.js` — passed. Eslint emitted the existing `baseline-browser-mapping` age warning only.
- `npm run typecheck` — passed.
- `npm run i18n:check-parity` — passed, 0 missing keys, 0 empty values. Existing orphan count remains 1131.

## Chrome DevTools MCP QA

- Opened `http://127.0.0.1:3000/` and confirmed the hero title exposes `Datasets profesionales para IA a medida` in the accessibility tree.
- Confirmed the Spline canvas renders behind the hero content without CSS scale or overscan; desktop canvas and hero centers match exactly with `x: 0`, `y: 0` center delta.
- Confirmed the dashboard mock remains present in the hero (`DATA MARKETPLACE CONSOLE`) and no `video` or `mux-video` elements are mounted.
- Confirmed the previous Spline CSP media error is gone after allowing `data:` in `media-src`.
- Network check: Spline runtime chunks and `scene.splinecode` load successfully. The public header still requests `/api/user/role` twice and receives `404`; this is unrelated to the hero/Spline work and was not introduced by the media replacement.

## Playwright Responsive QA

- Mobile viewport `390x844`: H1 is visible, Spline canvas is present, canvas and hero centers match exactly with `x: 0`, `y: 0` center delta, and no `video`/`mux-video` elements are mounted.
- Mobile console/request check from Playwright: no console errors and no failed requests observed.
- Verified the Spline scene remains centered and fluid on mobile while the title/subtitle remain readable and the dashboard mock remains in place.

## Screenshots

- `docs/logs/validations/assets/2026-04-16-landing-spline-centered-desktop.png`
- `docs/logs/validations/assets/2026-04-16-landing-spline-centered-mobile.png`
- `docs/logs/validations/assets/2026-04-16-landing-spline-centered-mobile-lower.png`
