# 2026-03-29 - Landing Hero Video Visibility Check

## Summary
Restored a working Mux clouds playback in the hero background, rebalanced the wash layers so the motion actually reads in the current landing redesign, and fixed local `LANDING_MODE` activation so `npm run dev` honors a single `.env.local` flag.

## Delivered
- Kept the hero on the working public Mux clouds playback, removed the static-poster-over-video feel once playback is ready, and preserved the same hero footprint.
- Re-tuned the hero background wash layers in `components/landing/video-background.tsx` so the editorial landing redesign keeps readable black typography without flattening the clouds into a white field.
- Added a dedicated white wash above the live Mux layer plus a longer bottom fade to white so the hero content reads more cleanly and the handoff into the rest of the landing page no longer hits a visible horizontal seam.
- Fixed the landing hero stacking context by isolating the home-page wrapper and moving the background video off the negative z-layer, so the Mux footage now renders above the white page canvas instead of disappearing behind it.
- Eliminated the `mux-video` hydration mismatch by rendering the player only after client hydration; the server now ships poster/gradient markup first and the live Mux element mounts afterward without the `src` attribute drift that React flagged.
- Nudged the hero copy/actions/dashboard upward, switched the dashboard shell shadow back to a neutral graphite shadow, and made the translucent header more glassy with a lighter white tint plus stronger blur.
- Mirrored `LANDING_MODE` into `NEXT_PUBLIC_LANDING_MODE` from `next.config.js`, so local `npm run dev` picks up landing mode on the client even when only `LANDING_MODE=true` is present in `.env.local`.
- Preserved the existing hero/video layout and section sizing while keeping the bottom fade behavior intact.

## Notes
- The newer replacement playback ID provided for follow-up testing currently returns `404` at the HLS manifest layer from Mux, so the hero remains on the last known working public playback until a valid public/signed replacement is available.
- Changing `LANDING_MODE` in `.env.local` still requires restarting `next dev`, because Next reads env configuration at server startup.
- Residual local `GET /api/user/role` `404` requests remain unrelated to the hero background and were already present during validation.
