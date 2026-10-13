/**
 * Minimal, valid PDFs for scan-detection tests (launch L-34): pages of real
 * text (Helvetica, extractable by Poppler) or pages that only paint an image,
 * the way a scanner produces them. No dependency: objects and the xref table
 * are written by hand.
 */
export type FixturePage = { lines?: string[]; image?: boolean };

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function makePdf(pages: FixturePage[]): Buffer {
  const objects: Buffer[] = [];
  const add = (body: Buffer | string) => { objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1")); return objects.length; };
  const catalog = add("");
  const pagesRef = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pixels = Buffer.alloc(64 * 64, 0x80);
  const image = add(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`, "latin1"),
    pixels, Buffer.from("\nendstream", "latin1"),
  ]));
  const kids: number[] = [];
  for (const page of pages) {
    const parts: string[] = [];
    if (page.image) parts.push("q 468 0 0 600 72 100 cm /Im1 Do Q");
    if (page.lines?.length) {
      parts.push("BT /F1 11 Tf 72 720 Td 14 TL");
      for (const line of page.lines) parts.push(`(${escape(line)}) Tj T*`);
      parts.push("ET");
    }
    const content = parts.join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`, "latin1");
  objects[pagesRef - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`, "latin1");
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    const head = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
    const tail = Buffer.from("\nendobj\n", "latin1");
    offsets.push(offset);
    chunks.push(head, body, tail);
    offset += head.length + body.length + tail.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

const POLICY = [
  "Home insurance policy: water damage from a burst pipe is covered up to 3,000 euros.",
  "Claims must be reported within 7 days of the incident through the customer portal.",
  "The excess for each claim is 150 euros, deducted from the amount paid.",
];
/** A text PDF: three pages of policy text. */
export const textPdf = () => makePdf([{ lines: POLICY }, { lines: POLICY.slice(1) }, { lines: POLICY.slice(0, 2) }]);
/** A scan: four image-only pages, no text at all. */
export const scannedPdf = () => makePdf([{ image: true }, { image: true }, { image: true }, { image: true }]);
/** A mostly scanned file with one typed cover page: 3 of 4 pages empty. */
export const mostlyScannedPdf = () => makePdf([{ lines: POLICY }, { image: true }, { image: true }, { image: true }]);
