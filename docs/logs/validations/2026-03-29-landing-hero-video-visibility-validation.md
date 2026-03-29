# Landing Hero Video Visibility Validation

- **Date:** 2026-03-29
- **Phase:** 32
- **Task:** `P32-T15`
- **Owner:** agent

## Automated Checks
- [x] `npm run typecheck`
- [x] `npx eslint app/'(home)'/page.tsx components/landing/video-background.tsx lib/landing-mode.ts next.config.js`

## Chrome DevTools MCP Verification
- [x] Landing hero wrapper isolates the background stack correctly (`relative isolate` root, `z-0` video background, `z-10` content), so the video is no longer hidden behind the page canvas.
- [x] Landing page loaded in the MCP browser without new hero-related console errors.
- [x] The previous `mux-video` hydration mismatch no longer appears after gating the live player to client-only mount.
- [x] `mux-video` present in the DOM and the current Mux stream reaches `readyState: 4`.
- [x] Playback confirmed active (`paused: false`) in both desktop and mobile viewport checks.
- [x] Poster fallback fades out (`opacity: 0`) once playback is ready.
- [x] Internal shadow-DOM video keeps `object-fit: cover`.
- [x] Mux media requests (`stream.mux.com` playlist and chunk fetches) return `200`.
- [x] Client navigation/CTA logic reflects landing mode under local dev with `.env.local` containing only `LANDING_MODE=true` after a fresh `next dev` restart.
- [x] White overlay and bottom fade now preserve hero readability while blending smoothly into the white landing canvas below.
- [x] Hero content stack sits higher, the dashboard preview uses a neutral dark shadow, and the sticky header keeps a more transparent glass treatment with `blur(22px)`.

## Visual Evidence
- [x] Desktop hero screenshot: `docs/logs/validations/2026-03-29-landing-hero-video-desktop.png`
- [x] Mobile hero screenshot: `docs/logs/validations/2026-03-29-landing-hero-video-mobile.png`
- [x] Full-page screenshot: `docs/logs/validations/2026-03-29-landing-hero-video-fullpage.png`

## Runtime Notes
- The hero stays on the working public Mux clouds playback, fades the poster completely once ready, and keeps the same section size while preserving a softer bottom transition into the next section.
- The latest pass adds a stronger white veil over the live video and extends the bottom white fade so the hero copy sits on a calmer background and the lower boundary dissolves into the rest of the page.
- A direct validation pass against the newer replacement playback ID returned `404` from `stream.mux.com`, so that asset was not kept in the landing until a valid public/signed configuration is available.
- Local dev now derives `NEXT_PUBLIC_LANDING_MODE` from `LANDING_MODE` through `next.config.js`; restarting `npm run dev` is still required after toggling the env flag.
- Residual local `GET /api/user/role` `404` noise remains pre-existing and unrelated to this check.
