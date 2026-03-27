# Phase 25 - Launch Video Castilian Copy Refinement

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-26

## Goal
- Refine the Caudals launch-video copy into more natural Castilian Spanish, using Gemini CLI for language review while preserving the Remotion structure, timing, and visual composition.

## Exit Criteria
- Gemini CLI reviews the launch-video copy and applies or proposes copy refinements.
- User-facing Remotion copy, canonical script copy, and fallback voiceover text are aligned.
- English product terms that are also natural in Spanish product usage stay in English where appropriate.
- Updated copy is validated against the current layout, the fallback voiceover is regenerated, and the final MP4 is re-rendered.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- This phase is a direct user-requested follow-up to Phase 24 and overrides the default queue order in `docs/PLAN.md`.
- The previous Spanish pass was functional, but some strings still sounded overly literal or insufficiently idiomatic in Castilian Spanish.
- Gemini CLI was requested specifically for the language pass; the final edit still requires human review because terminology choices can affect product tone, UI fit, and voiceover pacing.

## Stages

### S1 - Gemini Language Review
- Objective: Run Gemini CLI against the Remotion copy sources and let it revise user-facing text only.
- Outputs: Gemini-reviewed edits or recommendations across the launch-video source files.
- Done when: the requested files have been reviewed with Gemini and terminology decisions are visible in the resulting copy.
- Mapped Tasks: `P25-T01`

### S2 - Manual Copy Tuning and Regeneration
- Objective: Review Gemini's language choices, keep the strongest changes, correct awkward terminology, and regenerate the audio/video outputs.
- Outputs: updated copy files, refreshed fallback voiceover, validation stills, and final MP4.
- Done when: the copy reads naturally in Castilian Spanish and the updated render passes validation.
- Mapped Tasks: `P25-T02`, `P25-T03`, `P25-T04`

## Tasks
- [x] `P25-T01` (P0, DONE, owner: agent) Run Gemini CLI to review and rewrite the launch-video copy in `remotion/launch-video.tsx`, `REMOTION_SCRIPT.md`, and `scripts/generate-launch-voiceover.mjs`.
- [x] `P25-T02` (P0, DONE, owner: agent) Review Gemini's changes and manually refine terminology to keep the copy natural for Castilian Spanish product language.
- [x] `P25-T03` (P0, DONE, owner: agent) Regenerate the Spanish fallback voiceover and re-render the launch video with the updated narration track.
- [x] `P25-T04` (P1, DONE, owner: agent) Validate layout fit on the updated text scenes and verify final MP3/MP4 outputs.

## Validation Required
- `npm run typecheck`
- `npx eslint remotion scripts/generate-launch-voiceover.mjs --ext .ts,.tsx,.mjs`
- `npm run remotion:compositions`
- `npm run voiceover:launch:fallback`
- `./node_modules/.bin/remotion still remotion/index.ts CaudalsLaunchVideo output/stills/scene-3-website-text-pass.png --frame=430`
- `./node_modules/.bin/remotion still remotion/index.ts CaudalsLaunchVideo output/stills/scene-4-browse-text-pass.png --frame=640`
- `./node_modules/.bin/remotion still remotion/index.ts CaudalsLaunchVideo output/stills/scene-5-roles-text-pass.png --frame=880`
- `./node_modules/.bin/remotion render remotion/index.ts CaudalsLaunchVideo output/caudals-launch-video.mp4`
- `ffprobe -v error -show_entries stream=codec_name:format=duration,size -of json output/caudals-launch-voiceover.mp3`
- `ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height:format=duration,size -of json output/caudals-launch-video.mp4`

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-26-phase-25-launch-video-castilian-copy-refinement.md`
- Validation: `docs/logs/validations/2026-03-26-phase-25-launch-video-castilian-copy-refinement-validation.md`

## Mid-Execution Steering Notes
- Keep English terms such as `marketplace`, `feed`, `dashboard`, `QA`, `SLA`, and `ML` when they sound more natural in Spanish product language.
- Review Gemini output manually before delivery because direct replacements can flatten product tone or introduce less natural wording like logistics-flavoured `entregas`.
- Prefer short, premium, readable copy over literal translation fidelity.
