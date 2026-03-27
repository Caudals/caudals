# Phase 23 - Launch Video Castilian Localization and Design Polish

## Summary
- Localized the Caudals launch video into Castilian Spanish and updated the canonical script in `REMOTION_SCRIPT.md`.
- Swapped the video typography to `Plus Jakarta Sans` with lighter weight mapping for a cleaner editorial feel.
- Replaced the public-site screenshot scenes with code-generated browser surfaces for the landing, trust, and marketplace views.
- Rebalanced the browse and role scenes to remove bottom-frame clipping and regenerated the final video output.
- Cleared the last visible English holdovers from the on-screen copy before the final render.

## Implementation Notes
- Updated `remotion/theme.ts` to load `Plus Jakarta Sans` via `@remotion/google-fonts` and reduced the effective bold weight.
- Rewrote visible copy in `remotion/launch-video.tsx` to Spanish, including labels, role surfaces, marketplace cards, and closing value props.
- Expanded the Remotion composition with code-generated browser mocks:
  - public entry surface
  - trust center surface
  - marketplace browser surface
- Reduced mobile mock dimensions and role-scene drift amplitude to keep the composition inside safe frame bounds.
- Attempted the requested Gemini CLI redesign review with `gemini-3.1-pro-preview`; the provider returned repeated `MODEL_CAPACITY_EXHAUSTED` responses, so no Gemini-authored patch could be applied in this session.

## Outcome
- The polished launch film now presents Caudals with:
  - Spanish on-screen copy
  - lighter, more premium typography
  - code-generated public product surfaces
  - verified safe framing on the key scenes
  - regenerated still and MP4 outputs in `output/`
