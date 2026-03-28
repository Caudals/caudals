# Landing Hero Mux Video Validation

- **Date:** 2026-03-28
- **Phase:** 31
- **Task:** `P31-T01`
- **Owner:** agent

## Automated Checks
- [x] `npm run typecheck`
- [x] `npx eslint "app/(home)/page.tsx" components/landing/video-background.tsx components/landing/social-proof.tsx`
- [ ] Any required migration/schema verification (not applicable)

## Runtime Checks
- [x] Route/feature loads without new runtime console errors tied to the hero background change.
- [x] Critical user interaction path executed: landing page load with hero visible, CTA buttons visible, preview card and transition into the next section verified.
- [x] No new failed network requests tied to the change.

## Chrome DevTools MCP Verification
- Default MCP browser context confirms the live Mux path loads directly: `mux-video` reaches `readyState: 4`, `paused: false`, and active HLS playlist/segment requests to `stream.mux.com` return `200`.
- Follow-up mobile inspection confirmed the internal shadow-DOM `video` node is forced to `object-fit: cover` and the poster fallback fades to `opacity: 0`, removing the visible still-image seam above the live footage.
- Follow-up desktop inspection kept the original hero video height and instead softened the section handoff with a transparent-to-canvas overlay in the ecosystem block, removing the hard horizontal break seen below the first card row.
- The earlier `@mux/mux-player-react` cast-script CSP error no longer appears after the switch to `@mux/mux-video/react`.
- Residual public-route `GET /api/user/role` `404` requests remain in the default browser context and were already present before this hero change.

## UI Evidence
- [x] Desktop screenshot captured: `docs/logs/validations/2026-03-28-landing-hero-desktop-mux-video.png`
- [x] Tablet screenshot captured: `docs/logs/validations/2026-03-28-landing-hero-tablet-mux-video.png`
- [x] Mobile screenshot captured: `docs/logs/validations/2026-03-28-landing-hero-mobile-mux-video-followup.png`
- [x] Transition screenshot captured: `docs/logs/validations/2026-03-28-landing-hero-transition-mux-video-desktop-softened.png`

## Risk Notes
- Known limitations/tradeoffs: residual public-route `404` noise for `/api/user/role` remains in the local environment but is unrelated to the hero media change.
- Follow-up debt item required (`yes/no`): no

## Browser Notes
- Desktop viewport: hero footage renders as a pale cloud field behind the centered marketing copy and glass preview shell.
- Tablet viewport: hero copy, CTAs, and preview remain legible without crowding or an abrupt fade at the section boundary.
- Mobile viewport: hero text and CTAs remain readable, the poster no longer sits above the moving footage, and the bottom fade blends into the next section without a hard horizon line.
- Desktop transition: the ecosystem section now uses a long transparent-to-canvas wash so the hero media dissolves before the next neutral section begins, without enlarging the video container.
