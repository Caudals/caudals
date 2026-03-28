# 2026-03-28 - Landing Hero Mux Video

## Summary
Replaced the landing-page hero god-rays background with the supplied Mux-hosted video, tuned the hero surfaces so the footage feels integrated, fixed the mobile poster seam, and softened the desktop handoff into the ecosystem section without increasing the video block height.

## Delivered
- Swapped the landing hero background to the supplied Mux playback ID and kept the existing CSP/domain allowances already added in the worktree.
- Scoped the media background to the actual hero stack instead of the full early landing-page section run so the page returns to the neutral marketing canvas cleanly.
- Replaced the full Mux player wrapper with `@mux/mux-video/react` to avoid decorative-player chrome and remove the cast/CSP console noise seen in the first pass.
- Added a first-paint poster fallback that fades out only after the Mux stream is ready and forced the internal shadow-DOM video node to `object-fit: cover` so portrait/mobile layouts no longer show a static frame above a narrow live-video strip.
- Added a dedicated atmosphere wash inside the ecosystem section so the hero video resolves into the neutral page canvas through a transparent-to-cream gradient and blur veil rather than a hard horizontal cutoff.
- Softened the hero badge, secondary CTA, and preview shell with light glass treatments that sit naturally on top of the cloud footage.

## Notes
- The provided Mux secret key was not committed or wired into the app because the public playback ID was sufficient for this unsigned hero background.
