# Phase 26 - Launch Video Sequential Voiceover Assembly

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-26

## Goal
- Rebuild the final Caudals launch-video narration track from the already generated ElevenLabs scene MP3s so the scenes play one after another without overlapping, then render the final MP4.

## Exit Criteria
- Existing scene MP3s in `output/voiceover-scenes/` remain untouched.
- The final assembled narration track is sequential and fits the Remotion composition duration.
- The final launch-video MP4 is re-rendered against the rebuilt narration asset.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- This phase is a direct user-requested follow-up to Phase 24 and Phase 25.
- The issue was not voice generation quality but the way the final track was assembled from per-scene files.
- The user explicitly required preserving the existing scene MP3s and only rebuilding the final combined narration/video outputs.

## Stages

### S1 - Sequential Assembly Fix
- Objective: Rework the voiceover assembly path so existing scene assets are concatenated in order instead of mixed on a shared timeline.
- Outputs: updated assembly logic and refreshed metadata describing sequential timing.
- Done when: the combined narration track no longer contains overlapping scene voiceovers.
- Mapped Tasks: `P26-T01`, `P26-T02`

### S2 - Final Render and Verification
- Objective: Rebuild the final narration track and render the Remotion MP4 against it.
- Outputs: refreshed MP3/JSON outputs and final MP4 validation.
- Done when: the final MP3 and MP4 durations/codecs match the expected launch-video composition.
- Mapped Tasks: `P26-T03`, `P26-T04`

## Tasks
- [x] `P26-T01` (P0, DONE, owner: agent) Update the voiceover assembly pipeline to concatenate existing scene MP3s sequentially and normalize them to the full composition duration.
- [x] `P26-T02` (P0, DONE, owner: agent) Rebuild the voiceover metadata so each scene start time reflects the end of the previous scene.
- [x] `P26-T03` (P0, DONE, owner: agent) Assemble the final launch-video narration MP3 from the existing scene files without overwriting per-scene assets.
- [x] `P26-T04` (P1, DONE, owner: agent) Re-render the final Remotion MP4 and verify the output containers.

## Validation Required
- `node --check scripts/generate-launch-voiceover.mjs`
- `npx eslint scripts/generate-launch-voiceover.mjs --ext .mjs`
- `npm run remotion:compositions`
- `node scripts/generate-launch-voiceover.mjs --assemble-only`
- `ffprobe -v error -show_entries format=duration,size -of json output/caudals-launch-voiceover.mp3`
- `ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height:format=duration,size -of json output/caudals-launch-video.mp4`
- `./node_modules/.bin/remotion render remotion/index.ts CaudalsLaunchVideo output/caudals-launch-video.mp4`

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-26-phase-26-launch-video-sequential-voiceover-assembly.md`
- Validation: `docs/logs/validations/2026-03-26-phase-26-launch-video-sequential-voiceover-assembly-validation.md`

## Mid-Execution Steering Notes
- Do not regenerate or overwrite the per-scene ElevenLabs assets in `output/voiceover-scenes/`.
- Prefer sequential assembly semantics over timeline mixing for stitched narration tracks.
