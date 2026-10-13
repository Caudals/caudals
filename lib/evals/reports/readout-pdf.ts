/**
 * The readout PDF (launch L-35, spec P-57, §5.5 "Readout PDF"): every slide
 * of a readout deck on its own 16:9 page (1280 × 720 CSS px, 13.33 × 7.5 in),
 * rendered by the document worker with the same template as the screen
 * (./readout-document.ts). The deck never carries presenter notes, so the PDF
 * cannot contain one. Fonts are embedded, as in the report PDF.
 */
import { createHash } from "node:crypto";
import { GEIST_WOFF2 } from "./fonts";
import { readoutCopy } from "./readout-copy";
import { READOUT_CSS, renderReadoutSlide } from "./readout-document";
import type { ReadoutDeck, ReadoutNextStep } from "./readout";

/** Layout version of the readout PDF, carried in its export path so a layout change renders a fresh file. */
export const READOUT_DOCUMENT_VERSION = 1;
export const READOUT_PAGE = { width: 1280, height: 720 } as const;

/** What a readout export job renders (export_job.readout): the transcripts and the next step, never a note. */
export type ReadoutJobDeck = { transcript_ids: string[]; next_step: ReadoutNextStep };

/** The export path of a readout PDF: revision, language, a hash of the deck it shows and the layout version. */
export function readoutExportPath(revisionId: string, locale: "en" | "es", readout: ReadoutJobDeck) {
  const variant = createHash("sha256").update(JSON.stringify([readout.transcript_ids, readout.next_step])).digest("hex").slice(0, 12);
  return `readouts/${revisionId}${locale === "es" ? ".es" : ""}.${variant}.v${READOUT_DOCUMENT_VERSION}.pdf`;
}

const title = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function renderReadoutHtml(deck: ReadoutDeck): string {
  const copy = readoutCopy(deck.locale);
  const pages = deck.slides.map((_, index) => `<div class="rd-page"><div class="rd-frame">${renderReadoutSlide(deck, index)}</div></div>`).join("");
  return `<!doctype html><html lang="${deck.locale}"><head><meta charset="utf-8"><title>${deck.sample ? `${copy.sampleLabel} — ` : ""}${title(deck.system)} — ${copy.eyebrow}</title><style>
@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${GEIST_WOFF2}) format("woff2");font-weight:100 900;font-style:normal}
@page{size:${READOUT_PAGE.width}px ${READOUT_PAGE.height}px;margin:0}
html,body{margin:0;padding:0;background:#fff}
.rd-page{width:${READOUT_PAGE.width}px;height:${READOUT_PAGE.height}px;overflow:hidden;break-after:page;page-break-after:always}
.rd-page:last-child{break-after:auto;page-break-after:auto}
${READOUT_CSS}
</style></head><body>${pages}</body></html>`;
}

export interface ReadoutPdfPage {
  setContent(html: string, options: { waitUntil: "load" }): Promise<void>;
  pdf(options: { width: string; height: string; printBackground: true; preferCSSPageSize: true; displayHeaderFooter: false }): Promise<Uint8Array>;
}

export async function renderReadoutPdf(deck: ReadoutDeck, createPage: () => Promise<{ page: ReadoutPdfPage; close: () => Promise<void> }>): Promise<Uint8Array> {
  const owned = await createPage();
  try {
    await owned.page.setContent(renderReadoutHtml(deck), { waitUntil: "load" });
    return await owned.page.pdf({ width: `${READOUT_PAGE.width}px`, height: `${READOUT_PAGE.height}px`, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  } finally {
    await owned.close();
  }
}
