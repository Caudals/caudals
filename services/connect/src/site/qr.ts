import QRCode from 'qrcode';
import { esc } from './html.ts';

export interface QrMatrix {
  size: number;
  /** One string of '0'/'1' per row, dark = '1'. */
  rows: string[];
}

export function qrMatrix(text: string, ecc: 'L' | 'M' | 'Q' | 'H' = 'M'): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: ecc });
  const rows: string[] = [];
  for (let y = 0; y < modules.size; y++) {
    let row = '';
    for (let x = 0; x < modules.size; x++) row += modules.get(x, y) ? '1' : '0';
    rows.push(row);
  }
  return { size: modules.size, rows };
}

/** Crisp SVG with one path made of horizontal runs and a 4-module quiet zone. */
export function qrSvg(matrix: QrMatrix, label: string, className = 'qr'): string {
  const quiet = 4;
  const total = matrix.size + quiet * 2;
  let d = '';
  matrix.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '1') {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x] === '1') x++;
      d += `M${start + quiet} ${y + quiet}h${x - start}v1h${start - x}z`;
    }
  });
  return `<svg class="${className}" viewBox="0 0 ${total} ${total}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#111110"/></svg>`;
}
