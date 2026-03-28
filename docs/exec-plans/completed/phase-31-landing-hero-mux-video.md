# Phase 31 - Landing Hero Mux Video

- Status: DONE
- Priority: P1
- Owner: agent
- Last Updated: 2026-03-28

## Goal
- Replace the landing hero's god-rays treatment with the supplied Mux-hosted video while keeping the public marketing surface calm, readable, and production-polished.

## Exit Criteria
- The hero uses the supplied Mux playback as the canonical background, with the poster only acting as a startup fallback until the stream is ready.
- Hero transitions into the rest of the landing page without a hard visual seam.
- Chrome DevTools verification confirms responsive rendering and no new console/network failures caused by the change.

## Queue
- Queue Position: user-request override
- Blocking Dependencies: none

## Scope Context
- The work replaced an in-progress `@mux/mux-player-react` hero embed that still exposed player chrome and triggered cast/CSP noise.
- The supplied Mux secret key was intentionally not stored or used in code because the public playback ID is sufficient for this background treatment.
- The hero background was scoped to the hero stack instead of the entire early-page section run so the rest of the landing surface can return to the neutral canvas smoothly.

## Stages

### S1 - Hero Media Integration
- Objective: Ship a decorative Mux-backed hero background that feels native to the existing Caudals landing design.
- Outputs: updated hero background component, scoped background height handling, softened hero glass surfaces, validation evidence.
- Done when: Mux playback or poster fallback renders correctly and the hero blends cleanly into downstream sections.
- Mapped Tasks: `P31-T01`

## Tasks
- [x] `P31-T01` (P1, DONE, owner: agent) Replace the hero god-rays background with the supplied Mux playback, add a startup poster fallback, eliminate the mobile poster/video seam, and tune the hero transition into the landing page.

## Validation Required
- `npm run typecheck`
- targeted lint for touched landing files
- Chrome DevTools MCP console/network/screenshot verification

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-28-landing-hero-mux-video.md`
- Validation: `docs/logs/validations/2026-03-28-landing-hero-mux-video-validation.md`

## Mid-Execution Steering Notes
- `@mux/mux-video/react` replaced the heavier player wrapper so the decorative background no longer triggers media-chrome cast behavior.
- A follow-up mobile fix forced the internal shadow-DOM media node to `object-fit: cover` and faded the poster only after `loadeddata/canplay/playing`, removing the visible still-frame seam in portrait viewports.
- A follow-up desktop fix kept the original video height and moved the blend into the ecosystem section itself with a transparent-to-canvas wash, avoiding a hard horizontal cutoff without expanding the hero media block.
