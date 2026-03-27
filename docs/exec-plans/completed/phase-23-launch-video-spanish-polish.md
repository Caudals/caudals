# Phase 23 - Launch Video Castilian Localization and Design Polish

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-26

## Goal
- Localize the Caudals Remotion launch video into Castilian Spanish, replace screenshot-heavy public scenes with code-generated interfaces, refine typography, and eliminate frame-bottom clipping before final delivery.

## Exit Criteria
- All visible launch-video copy is in Castilian Spanish.
- The primary website, trust, and marketplace scenes use code-generated browser surfaces rather than reused validation imagery.
- The display font and weight feel lighter and more editorial than the initial draft.
- Representative rendered frames confirm no important content is clipped at the bottom of the frame.
- The MP4 and still outputs are regenerated and verified.
- Validation and changelog notes capture the work, including the Gemini CLI review attempt.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- This phase is a direct user-requested follow-up to Phase 22 and overrides the default queue order in `docs/PLAN.md`.
- The previous build already established the Remotion composition, transitions, and render pipeline.
- The user tightened requirements after the first render:
  - visible text in Spanish
  - font change with lighter bold
  - no bottom clipping
  - Gemini CLI review/redesign attempt
- Gemini CLI `gemini-3.1-pro-preview` access is environment-dependent and may fail due provider-side capacity.

## Stages

### S1 - Localization and Art Direction Refresh
- Objective: Convert the launch-film copy and typographic system to the requested Castilian Spanish direction.
- Outputs: updated `REMOTION_SCRIPT.md`, revised theme/font settings, Spanish scene copy.
- Done when: visible text and tone are aligned with the requested language and brand feel.
- Mapped Tasks: `P23-T01`, `P23-T02`

### S2 - Interface Rebuild and Safe-Frame Polish
- Objective: Replace fragile screenshot sections with code-generated browser surfaces and rebalance layouts to stay within frame-safe bounds.
- Outputs: updated Remotion composition with code-generated public/trust/marketplace surfaces and safe role-scene layout.
- Done when: key rendered frames show the intended scenes without bottom clipping.
- Mapped Tasks: `P23-T03`, `P23-T04`

### S3 - Render, External Review Attempt, and Logging
- Objective: Regenerate the final output, run targeted validation, attempt the requested Gemini review, and record all evidence.
- Outputs: final MP4/still renders, validation notes, changelog, documented Gemini outcome.
- Done when: outputs exist, checks pass, and the review attempt status is recorded.
- Mapped Tasks: `P23-T05`, `P23-T06`

## Tasks
- [x] `P23-T01` (P0, DONE, owner: agent) Rewrite the launch-video script and visible scene copy into Castilian Spanish.
- [x] `P23-T02` (P0, DONE, owner: agent) Change the video typography to a lighter editorial sans treatment and rebalance bold usage.
- [x] `P23-T03` (P0, DONE, owner: agent) Replace screenshot-led web scenes with code-generated browser surfaces for landing, trust, and marketplace views.
- [x] `P23-T04` (P0, DONE, owner: agent) Reframe the role and browse scenes so important content is not clipped at the bottom of the frame.
- [x] `P23-T05` (P1, DONE, owner: agent) Re-render the composition, still outputs, and runtime metadata for the polished Spanish cut.
- [x] `P23-T06` (P1, DONE, owner: agent) Attempt the requested Gemini CLI review and log the result, validations, and delivery notes.

## Validation Required
- `npm run typecheck`
- `npx eslint remotion --ext .ts,.tsx`
- `./node_modules/.bin/remotion compositions remotion/index.ts`
- `./node_modules/.bin/remotion still remotion/index.ts CaudalsLaunchVideo output/2026-03-26-launch-video-still.png --frame=860`
- representative frame renders for website, browse, roles, and close scenes
- `./node_modules/.bin/remotion render remotion/index.ts CaudalsLaunchVideo output/caudals-launch-video.mp4`
- `ffprobe -v error -show_entries stream=codec_name,width,height:format=duration,size -of json output/caudals-launch-video.mp4`

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-26-phase-23-launch-video-spanish-polish.md`
- Validation: `docs/logs/validations/2026-03-26-phase-23-launch-video-spanish-polish-validation.md`

## Mid-Execution Steering Notes
- Prefer code-generated public surfaces over brittle screenshots when localization or cropping becomes difficult to control.
- Keep the composition silent and text-led.
- Record external-review blockers explicitly instead of silently skipping them.
