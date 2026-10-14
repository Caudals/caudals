import { MARK_BOX, MARK_PATHS } from '../../shared/mark.ts';

// Card faces are drawn as masks, one meaning per channel, white on black:
// red = ink (its value is the ink density), green = holographic foil.
// The card shader turns them into materials.

export const CARD_RATIO = 85.6 / 53.98;

export interface FaceData {
  cardLines: readonly [string, string];
  roleLine: string;
  phoneDisplay: string;
  email: string;
  shortUrl: string;
  qr: string[];
}

export const FONTS = {
  sans: '"Geist Variable", "Geist", system-ui, sans-serif',
  mono: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
};

export async function fontsReady(): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`400 64px ${FONTS.sans}`),
      document.fonts.load(`500 64px ${FONTS.sans}`),
      document.fonts.load(`400 64px ${FONTS.mono}`),
    ]);
  } catch {
    // Fall back to whatever is available; the card still renders.
  }
}

const INK = (density: number) => `rgb(${Math.round(255 * density)},0,0)`;
const FOIL = (density = 1) => `rgb(0,${Math.round(255 * density)},0)`;

function canvas(width: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round(width / CARD_RATIO);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.textBaseline = 'alphabetic';
  return [c, ctx];
}

function mark(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, fill: string): number {
  const scale = height / MARK_BOX.height;
  ctx.save();
  ctx.translate(x - MARK_BOX.x * scale, y - MARK_BOX.y * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  for (const d of MARK_PATHS) ctx.fill(new Path2D(d));
  ctx.restore();
  return MARK_BOX.width * scale;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, fill: string, tracking = 0) {
  ctx.font = font;
  ctx.fillStyle = fill;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tracking}px`;
  }
  ctx.fillText(value, x, y);
}

/** Fits text to a width by shrinking the font size. */
function fitSize(ctx: CanvasRenderingContext2D, value: string, weight: number, family: string, size: number, maxWidth: number): number {
  let s = size;
  for (let i = 0; i < 12; i++) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(value).width <= maxWidth) break;
    s *= 0.94;
  }
  return s;
}

export function drawFront(data: FaceData, width: number): HTMLCanvasElement {
  const [c, ctx] = canvas(width);
  const W = c.width;
  const H = c.height;
  const pad = 0.072 * W;

  const brandH = 0.046 * W;
  const brandW = mark(ctx, pad, pad * 0.92, brandH, INK(0.94));
  text(ctx, 'Caudals', pad + brandW + 0.016 * W, pad * 0.92 + brandH * 0.86, `500 ${0.04 * W}px ${FONTS.sans}`, INK(0.94), -0.0008 * W);

  const markH = 0.3 * W;
  const markW = (MARK_BOX.width / MARK_BOX.height) * markH;
  mark(ctx, W - pad - markW, (H - markH) / 2, markH, FOIL());

  const nameMax = W - pad * 2 - markW - 0.04 * W;
  const nameSize = Math.min(
    fitSize(ctx, data.cardLines[0], 400, FONTS.sans, 0.066 * W, nameMax),
    fitSize(ctx, data.cardLines[1], 400, FONTS.sans, 0.066 * W, nameMax),
  );
  const roleY = H - pad * 0.98;
  const line2 = roleY - 0.074 * W;
  const line1 = line2 - nameSize * 1.06;
  const nameFont = `400 ${nameSize}px ${FONTS.sans}`;
  text(ctx, data.cardLines[0], pad - 0.002 * W, line1, nameFont, INK(1), -0.032 * nameSize);
  text(ctx, data.cardLines[1], pad - 0.002 * W, line2, nameFont, INK(1), -0.032 * nameSize);
  text(ctx, data.roleLine, pad, roleY, `400 ${0.033 * W}px ${FONTS.sans}`, INK(0.6), 0);
  return c;
}

export function drawBack(data: FaceData, width: number): HTMLCanvasElement {
  const [c, ctx] = canvas(width);
  const W = c.width;
  const H = c.height;
  const pad = 0.072 * W;

  const size = data.qr.length;
  const qrBox = 0.4 * W;
  const quiet = 3;
  const cell = qrBox / (size + quiet * 2);
  const qx = pad * 0.62;
  const qy = (H - qrBox) / 2;
  ctx.fillStyle = INK(1);
  data.qr.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '1') {
        ctx.fillRect(qx + (x + quiet) * cell, qy + (y + quiet) * cell, cell + 0.5, cell + 0.5);
      }
    }
  });

  const x0 = qx + qrBox + 0.045 * W;
  const maxW = W - x0 - pad;
  const nameSize = Math.min(
    fitSize(ctx, data.cardLines[0], 400, FONTS.sans, 0.054 * W, maxW),
    fitSize(ctx, data.cardLines[1], 400, FONTS.sans, 0.054 * W, maxW),
  );
  const top = pad + nameSize * 0.9;
  const nameFont = `400 ${nameSize}px ${FONTS.sans}`;
  text(ctx, data.cardLines[0], x0, top, nameFont, INK(1), -0.03 * nameSize);
  text(ctx, data.cardLines[1], x0, top + nameSize * 1.08, nameFont, INK(1), -0.03 * nameSize);
  text(ctx, data.roleLine, x0, top + nameSize * 1.08 + 0.052 * W, `400 ${0.03 * W}px ${FONTS.sans}`, INK(0.58));

  const mono = `400 ${fitSize(ctx, data.email, 400, FONTS.mono, 0.03 * W, maxW)}px ${FONTS.mono}`;
  const bottom = H - pad;
  text(ctx, data.phoneDisplay, x0, bottom - 0.105 * W, mono, INK(0.92));
  text(ctx, data.email, x0, bottom - 0.06 * W, mono, INK(0.92));
  text(ctx, data.shortUrl, x0, bottom, `400 ${fitSize(ctx, data.shortUrl, 400, FONTS.mono, 0.024 * W, maxW - 0.07 * W)}px ${FONTS.mono}`, INK(0.5));

  const small = 0.046 * W;
  const smallW = (MARK_BOX.width / MARK_BOX.height) * small;
  mark(ctx, W - pad - smallW, bottom - small * 0.86, small, FOIL());
  return c;
}
