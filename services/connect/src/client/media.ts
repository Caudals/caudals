// Still renders for scripts/media.mjs (dev server only).
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import { createStage, type Still } from './scene/stage.ts';
import type { FaceData } from './scene/textures.ts';

interface MediaData {
  face: FaceData;
  dark: boolean;
  still: Still;
}

const ready = (window as unknown as { __mediaReady?: boolean });
const data = JSON.parse(document.getElementById('media-data')?.textContent ?? 'null') as MediaData | null;
const stage = document.querySelector<HTMLElement>('[data-stage]');
const canvas = stage?.querySelector('canvas');
const anchor = stage?.querySelector<HTMLElement>('[data-anchor]');

if (data && stage && canvas && anchor) {
  await document.fonts.ready;
  await createStage({
    canvas,
    stage,
    anchor: () => anchor.getBoundingClientRect(),
    face: data.face,
    dark: data.dark,
    reducedMotion: false,
    still: data.still,
    onReady: () => {
      requestAnimationFrame(() => (ready.__mediaReady = true));
    },
  });
} else {
  ready.__mediaReady = true;
}
