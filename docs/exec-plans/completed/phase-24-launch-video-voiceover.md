# Phase 24 - Launch Video Spanish Voiceover Delivery

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-26

## Goal
- Add a Spanish narration track to the Caudals Remotion launch video, keep the output aligned to the existing scene timing, and leave a reusable generation pipeline for future voice swaps.

## Exit Criteria
- A reusable voiceover generator exists for the Remotion launch video.
- The pipeline attempts ElevenLabs first and records any provider-side blocker explicitly.
- A Spanish narration asset is generated and stored under `public/remotion/audio/`.
- The Remotion composition embeds the narration track and the final MP4 is re-rendered with audio.
- Validation and changelog notes capture the output paths, timing, and ElevenLabs status.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- This phase is a direct user-requested follow-up to Phase 23 and overrides the default queue order in `docs/PLAN.md`.
- The user requested Spanish audio suitable for the finished launch video and explicitly authorized tool installation if needed.
- ElevenLabs access depends on the account state tied to the provided API key, so synthesis may be blocked even when the integration is correct.
- Secrets must not be written to repository files, logs, screenshots, or command history.

## Stages

### S1 - Voiceover Pipeline
- Objective: Add a reproducible generator that can synthesize or assemble a scene-timed narration track for the launch video.
- Outputs: generation script, npm scripts, scene timing metadata.
- Done when: the narration can be regenerated into both Remotion asset storage and export storage.
- Mapped Tasks: `P24-T01`, `P24-T02`

### S2 - Audio Integration and Delivery
- Objective: Produce a usable Spanish narration asset, wire it into the composition, and re-render the launch film with audio.
- Outputs: final MP3, updated Remotion composition, regenerated MP4.
- Done when: the final video contains both video and audio streams and the output timing remains aligned.
- Mapped Tasks: `P24-T03`, `P24-T04`, `P24-T05`

## Tasks
- [x] `P24-T01` (P0, DONE, owner: agent) Implement a scene-aware narration generator for the launch video with reusable timing metadata and output paths.
- [x] `P24-T02` (P0, DONE, owner: agent) Attempt ElevenLabs synthesis, select the best Spanish voice candidate, and log the provider-side blocker when synthesis is refused.
- [x] `P24-T03` (P0, DONE, owner: agent) Generate a Spanish fallback narration track with per-scene assets aligned to the Remotion composition runtime.
- [x] `P24-T04` (P0, DONE, owner: agent) Embed the narration asset into `CaudalsLaunchVideo` and regenerate the final MP4.
- [x] `P24-T05` (P1, DONE, owner: agent) Validate the audio asset, composition discovery, and final MP4 container metadata.

## Validation Required
- `npm run typecheck`
- `npx eslint remotion --ext .ts,.tsx`
- `npm run remotion:compositions`
- `ffprobe -v error -show_entries stream=codec_name:format=duration,size -of json output/caudals-launch-voiceover.mp3`
- `ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height:format=duration,size -of json output/caudals-launch-video.mp4`

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-26-phase-24-launch-video-voiceover.md`
- Validation: `docs/logs/validations/2026-03-26-phase-24-launch-video-voiceover-validation.md`

## Mid-Execution Steering Notes
- Keep the ElevenLabs integration in place even if the provider refuses synthesis so the pipeline is ready once the account restriction is resolved.
- Prefer deterministic scene-timed audio assembly over manually trimming clips inside the Remotion component tree.
- Do not persist API keys or provider credentials in source files, generated metadata, or logs.
