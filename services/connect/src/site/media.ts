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
  still: { rotX?: number; rotY?: number; beta?: number; gamma?: number; eyeBeta?: number; eyeGamma?: number; presence?: number; hideCard?: boolean; grain?: number };
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

const MARK_RATIO = 926.9 / 1053.7;

/** Wallet wordmark: mark and name on a transparent 1280 × 400 canvas (Apple draws it in a 160 × 50 pt slot). */
const wordmark = () =>
  shell(
    1280,
    400,
    `<div style="height:400px;display:flex;align-items:center;gap:58px;padding-left:36px;color:#ffffff;font-family:'Geist Variable',sans-serif">${markSvg('m').replace('<svg', '<svg style="height:250px;width:auto;flex:none"')}<span style="font-weight:500;font-size:236px;line-height:1;letter-spacing:-0.035em;transform:translateY(-6px)">Caudals</span></div>`,
  );

/**
 * Wallet poster (iOS 27 posterGeneric, 690 × 1010): Wallet darkens it and
 * lays the wordmark, the name, two contact lines and the QR over it, so the
 * art stays quiet: deep ink, the card's holographic mark bleeding off the
 * right edge and one soft reflection (no grain, to keep the pass light).
 */
const poster = () => {
  const markH = 640;
  const markW = markH * MARK_RATIO;
  const holo = `<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#9fd8cc"/><stop offset="0.28" stop-color="#b5a8ec"/><stop offset="0.52" stop-color="#f0b9cf"/>
<stop offset="0.76" stop-color="#f3dea4"/><stop offset="1" stop-color="#a5d3ee"/></linearGradient>`;
  const mark = markSvg('m')
    .replace('<svg', `<svg style="position:absolute;left:${690 - markW * 0.64}px;top:64px;height:${markH}px;width:${markW}px"`)
    .replace('xmlns="http://www.w3.org/2000/svg">', `xmlns="http://www.w3.org/2000/svg"><defs>${holo}</defs>`)
    .replaceAll('fill="currentColor"', 'fill="url(#holo)" fill-opacity="0.16" stroke="url(#holo)" stroke-opacity="0.45" stroke-width="2.5"');
  return shell(
    690,
    1010,
    `<div style="position:relative;width:690px;height:1010px;overflow:hidden;background:linear-gradient(162deg,#24241f 0%,#161614 42%,#0d0d0c 100%)">
<div style="position:absolute;left:300px;top:90px;width:540px;height:540px;border-radius:50%;background:radial-gradient(closest-side,rgba(181,200,214,0.16),rgba(181,200,214,0) 72%)"></div>
${mark}
<div style="position:absolute;left:-260px;top:300px;width:1300px;height:170px;transform:rotate(-27deg);background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.055) 48%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.055) 52%,rgba(255,255,255,0))"></div>
</div>`,
  );
};

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
        still: { rotX: num('rotX', 0.1), rotY: num('rotY', -0.3), beta: num('beta', 50), gamma: num('gamma', -6), eyeBeta: num('eyeBeta', 58), eyeGamma: num('eyeGamma', 0) },
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
        still: { hideCard: true },
        overlay: `<div style="position:fixed;inset:0;display:grid;place-items:center;color:${PAPER};font-family:'Geist Variable',sans-serif"><div style="display:grid;justify-items:center;gap:26px">${markSvg('m').replace('<svg', '<svg style="height:92px;width:auto"')}<div style="font-size:64px;letter-spacing:-0.04em">${esc(title)}</div></div></div>`,
      });
    }
    case 'poster':
      return poster();
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
        case 'wallet-logo':
          return tile(160, 'transparent', '#ffffff', 132);
        case 'wallet-wordmark':
          return wordmark();
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
