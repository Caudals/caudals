# 2026-04-21 - Caudals Launch Promo Video (Remotion)

## Summary
Built a ~2 minute promotional launch video for Caudals from scratch, covering
three aspect ratios (16:9 landscape, 1:1 square, 9:16 vertical) ready for
LinkedIn / X / Instagram / Reels / Shorts. All copy is Castilian Spanish
with a male Gemini TTS voiceover, a synthesized ambient music bed, and
editorial motion that follows the landing design system.

- 8-scene story (hook, why data, paradox, intro, suppliers, buyers, standard,
  CTA) focused on *why data matters* for training AI, not on how models learn.
- Voiceover generated via `gemini-3.1-flash-tts-preview` (voice "Charon") with
  a Spanish-from-Spain style prompt and `[slow]`, `[pause]`, `[pause short]`,
  `[emphasize]` bracket markers per the Gemini TTS preview docs.
- Royalty-free ambient pad synthesized from first principles with `ffmpeg`
  (sine-voice drone in A minor + low-passed pink noise, 140 s, fade in/out).
- Responsive layout system (`VariantConfig`) shrinks fonts, switches grid
  to 2×2 on square and 1-col on vertical, and swaps the S3 paradox diagram
  from side-by-side to stacked so nothing clips.
- Screenshot-validated all 3 variants × 8 scenes (24 stills) before full
  render.

## Ignored prior Remotion work
Per user direction ("Ignora todo lo que tenía hasta el momento de vídeo
antiguo en mi repo"), none of the earlier drafts of the launch video were
reused. The `remotion/` directory was rebuilt from scratch. The whole
`remotion/`, `public/remotion/` and `output/` trees are already gitignored
via existing rules (`*remotion*`, `*output*`, `*.mp3`, `*.mp4`).

## Files

### Composition
- `remotion/Root.tsx` - registers 3 compositions (landscape/square/vertical)
  that share `CaudalsLaunchVideo` and resolve variant-specific width/height/
  duration via `calculateLaunchMetadata`.
- `remotion/index.ts` - `registerRoot`.
- `remotion/theme.ts` - brand tokens (colors, shadows, spring configs) and
  `waitForFonts` loader for Inter + Playfair Display italic.

### Launch-video module
- `remotion/launch/launch-video.tsx` - top-level composition: `TransitionSeries`
  with 12-frame fade transitions, per-scene `<Audio>` via `<Sequence>` with
  cursor-driven offsets that account for transition overlap, and a looped
  ambient music bed with in/out volume fades.
- `remotion/launch/variants.ts` - three `VariantConfig`s (1920×1080, 1080×1080,
  1080×1920) with per-variant font scale, safe zones, stack direction, logo
  width, and `isNarrow` / `isSquareish` flags.
- `remotion/launch/utils/motion.ts` - shared spring-based helpers (`fadeUp`,
  `fadeScale`, `exitFade`, `animatedCount`, `drawProgress`, `secondsToFrames`).
- `remotion/launch/utils/scene-manifest.ts` - types for the TTS manifest and
  helpers (`getSceneDurationSeconds`, `getSceneAudioPath`, `SCENE_PAD_SECONDS`).

### Components
- `remotion/launch/components/primitives.tsx` - `Eyebrow`, `TealDot`, `Display`,
  `Body`, `Caption`, `Pill`, `Divider`, `Card`, `Check` (SVG draw-in).
- `remotion/launch/components/scene-frame.tsx` - safe-zone `AbsoluteFill`
  wrapper.
- `remotion/launch/components/logo.tsx` - `CaudalsWordmark` that renders the
  mark icon + "Caudals" text to mirror the landing navbar.

### Scenes (one file each)
- `remotion/launch/scenes/scene-01-hook.tsx` - three-line editorial headline
  with animated teal underline on "los datos" and serif italic "que la
  entrenan."
- `remotion/launch/scenes/scene-02-why-data.tsx` - two editorial stat cards
  (Epoch AI 2026–2032 data-wall window + Anaconda "more time preparing data
  than training models"), closed by a serif italic payoff line.
- `remotion/launch/scenes/scene-03-paradox.tsx` - split diagram with a
  6-sector "buildings" grid on the left (RETAIL · LOGÍSTICA · AGRICULTURA ·
  SALUD · INDUSTRIA · FINTECH), 3 neutral AI-team avatars scanned by an
  animated magnifier on the right, serif italic "desconectados." between.
  Stacks vertically on narrow variant.
- `remotion/launch/scenes/scene-04-intro.tsx` - wordmark + teal bar + two-line
  tagline + "NUEVO · LANZAMIENTO 2026" pill.
- `remotion/launch/scenes/scene-05-suppliers.tsx` - horizontal 3-step flow
  with teal connector draw-in, numbered nodes, and draw-in checkmarks.
- `remotion/launch/scenes/scene-06-buyers.tsx` - "dataset brief" rows
  (Caso de uso · Modalidad · Entrega) that match the landing contact form's
  bottom-border aesthetic.
- `remotion/launch/scenes/scene-07-what-you-get.tsx` - 4-pillar grid
  (Claridad · Calidad · Compatibilidad · Confianza) with per-pillar draw-in
  checkmark and teal accent bar.
- `remotion/launch/scenes/scene-08-cta.tsx` - wordmark + teal bar + two-line
  display + black rounded "caudals.com" button with pulsing teal dot +
  "Solicita acceso · Waitlist abierta" + three bullet highlights.

### Voiceover pipeline
- `scripts/generate-launch-voiceover.mjs` - Gemini TTS client using the
  new `gemini-3.1-flash-tts-preview` model, Spanish-from-Spain style prompt,
  `[]` bracket markers, PCM→WAV→MP3 via `ffmpeg`, rate-limit retry with
  backoff, inter-scene throttling, and `--skip-existing` so partial runs
  resume cleanly. Writes a `scene-manifest.json` with per-scene duration,
  WAV/MP3 path, and text. MP3s feed Remotion at render time.
- `public/remotion/audio/scene-manifest.json` (gitignored) - generated
  manifest for the 8 scenes (total ≈ 136.68 s of voiceover).

### Music bed
- `public/remotion/music/caudals-launch-music.mp3` (gitignored) - 140 s
  synthesized A-minor ambient drone, low-passed at 2.8 kHz, fade in/out.
  Produced via `ffmpeg` `sine + anoisesrc + lowpass + afade`.

### `package.json`
- `remotion:studio`, `remotion:compositions` remain pointed at
  `remotion/index.ts`.
- New `remotion:still:{landscape,square,vertical}` and
  `remotion:render:{landscape,square,vertical}` scripts for the three
  variants.

## Design contract
- Editorial white canvas (`#ffffff`), ink typography (`#111827`),
  teal accent (`#059669` / `#047857`).
- Inter sans-serif + Playfair Display italic serif for highlighted phrases,
  matching the landing hero's "font-serif italic text-teal-700/90".
- Spring motion tuned to the landing (`damping:18, stiffness:140, mass:0.8`).
- 12-frame fade transition between every scene; per-scene audio timed so it
  starts at the new scene and overlaps the outgoing one by the fade window.
- No revenue-share claim, no third-party logos, no fictitious hero preview.

## Known trade-offs
- Voiceover runs ≈ 2:16; the ask was "2 minutes or less". Scenes 2 and 5
  are the longest and can be tightened in a follow-up by removing the
  `[pause]` between clauses if desired.
- The ambient pad is a simple tonal bed rather than a produced music track;
  if the team prefers a licensed track, drop it at
  `public/remotion/music/caudals-launch-music.mp3` (same filename) and the
  composition will pick it up unchanged.

## Validation
- See `docs/logs/validations/2026-04-21-launch-promo-video-validation.md`.
