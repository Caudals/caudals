// Dev-server pages that scripts/media.mjs screenshots into share images, app
// icons and Wallet artwork. They reuse the live scene in a still pose.
import { COPY } from '../data/copy.ts';
import { HOST, PEOPLE, links, type Locale } from '../data/people.ts';
import { markSvg } from '../shared/mark.ts';
import { esc, jsonScript } from './html.ts';
import { qrMatrix } from './qr.ts';

const INK = '#141413';
const PAPER = '#f2f1ec';

const shell = (width: number, height: number, body: string, script = false) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1">
<style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}
.stage{position:fixed;inset:0}
.stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.anchor{position:absolute;aspect-ratio:85.6/53.98;translate:-50% -50%}
.tile{width:${width}px;height:${height}px;display:grid;place-items:center}
.tile svg{display:block}
</style>
${script ? '<script type="module" src="/src/client/media.ts"></script>' : '<script>document.fonts.ready.then(() => { window.__mediaReady = true; });</script>'}
</head><body>${body}</body></html>`;

interface StageSpec {
  width: number;
  height: number;
  anchor: { x: number; y: number; w: number };
  dark: boolean;
  still: { rotX: number; rotY: number; time: number; sweep?: number; presence?: number; hideCard?: boolean; grain?: number };
  personId?: string;
  locale?: Locale;
  overlay?: string;
}

function stagePage(s: StageSpec): string {
  const p = PEOPLE.find((x) => x.id === s.personId) ?? PEOPLE[0]!;
  const l = s.locale ?? 'es';
  const face = {
    cardLines: p.cardLines,
    roleLine: COPY[l].roleLine(p),
    phoneDisplay: p.phoneDisplay,
    email: p.email,
    shortUrl: `${HOST}/${p.id}`,
    qr: qrMatrix(links.card(p), 'M').rows,
  };
  return shell(
    s.width,
    s.height,
    `<div class="stage" data-stage><canvas></canvas><div class="anchor" data-anchor style="left:${s.anchor.x}px;top:${s.anchor.y}px;width:${s.anchor.w}px"></div></div>${s.overlay ?? ''}${jsonScript('media-data', { face, dark: s.dark, still: s.still })}`,
    true,
  );
}

const tile = (size: number, background: string, color: string, markHeight: number, radius = 0) =>
  shell(
    size,
    size,
    `<div class="tile" style="background:${background};color:${color};border-radius:${radius}px">${markSvg('m').replace('<svg', `<svg style="height:${markHeight}px;width:auto"`)}</div>`,
  );

export function mediaPage(url: URL): string | null {
  const [, kind, a, b] = url.pathname.split('/').filter(Boolean);
  switch (kind) {
    case 'og': {
      const locale: Locale = b === 'en' ? 'en' : 'es';
      const num = (key: string, fallback: number) => {
        const v = Number(url.searchParams.get(key));
        return url.searchParams.has(key) && Number.isFinite(v) ? v : fallback;
      };
      return stagePage({
        width: 1200,
        height: 630,
        anchor: { x: 600, y: 322, w: 700 },
        dark: url.searchParams.get('theme') !== 'light',
        still: { rotX: num('rotX', 0.16), rotY: num('rotY', -0.36), time: num('time', 18.5), sweep: num('sweep', 0.42) },
        personId: a,
        locale,
      });
    }
    case 'og-site': {
      const locale: Locale = a === 'en' ? 'en' : 'es';
      const title = COPY[locale].index.title;
      return stagePage({
        width: 1200,
        height: 630,
        anchor: { x: 600, y: 318, w: 560 },
        dark: true,
        still: { rotX: 0, rotY: 0, time: 9, hideCard: true },
        overlay: `<div style="position:fixed;inset:0;display:grid;place-items:center;color:${PAPER};font-family:'Geist Variable',sans-serif"><div style="display:grid;justify-items:center;gap:26px">${markSvg('m').replace('<svg', '<svg style="height:92px;width:auto"')}<div style="font-size:64px;letter-spacing:-0.04em">${esc(title)}</div></div></div>`,
      });
    }
    case 'poster':
      return stagePage({
        width: 690,
        height: 1010,
        anchor: { x: 345, y: 800, w: 300 },
        dark: true,
        still: { rotX: 0, rotY: 0, time: 31, hideCard: true, grain: 0 },
      });
    case 'icon': {
      switch (a) {
        case 'app-512':
          return tile(512, INK, PAPER, 250);
        case 'app-maskable-512':
          return tile(512, INK, PAPER, 196);
        case 'app-192':
          return tile(192, INK, PAPER, 94);
        case 'apple-180':
          return tile(180, INK, PAPER, 86);
        case 'favicon-32':
          return tile(32, INK, PAPER, 18, 7);
        case 'photo':
          return tile(256, INK, PAPER, 112);
        case 'wallet-logo':
          return tile(160, 'transparent', '#ffffff', 132);
        case 'wallet-icon':
          return tile(120, INK, '#ffffff', 64);
        default:
          return null;
      }
    }
    default:
      return null;
  }
}
