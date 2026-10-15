/**
 * The readout slides as HTML (launch L-35, spec P-57). One template renders
 * the slides on screen (readout mode, the presenter view) and in the 16:9
 * PDF (./readout-pdf.ts), so both show the same words and numbers. Every
 * value from the snapshot is escaped; no script runs inside a slide.
 *
 * Sizes are in slide units (`--u`, 1/1280 of the slide's width), so a slide
 * looks the same at every size: 1280 × 720 in the PDF, the whole screen on a
 * projector (body text 24 units, 36 px at 1920 × 1080). On phones the slide
 * becomes a readable scrolling card instead of a scaled-down picture.
 * Browser-safe: no fonts or server modules.
 */
import { readoutCopy } from "./readout-copy";
import type { ReadoutDeck, ReadoutSlide } from "./readout";
import { fill } from "./summary-copy";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const u = (n: number) => `calc(${n} * var(--u))`;
/** Review-status chips in the tones of the report's status badges (components/evals/primitives.tsx): preliminary is info, not a warning. */
const STATUS_TONE: Record<string, string> = { reviewed: "pass", complete: "pass", expert_reviewed: "pass", preliminary: "info", incomplete: "warn" };

/**
 * Slide stylesheet, scoped to `.rd-*`. Colours fall back to the platform
 * tokens' values (packages/brand/platform.css) because the PDF loads no
 * platform stylesheet.
 */
export const READOUT_CSS = `
.rd-frame{container-type:inline-size;width:100%}
.rd-slide{--u:calc(100cqw / 1280);--rd-text:var(--p-text,#0c0c0b);--rd-muted:var(--p-text-secondary,#6d6d68);--rd-faint:var(--p-text-tertiary,#9a9a94);--rd-surface:#ffffff;--rd-surface-2:var(--p-surface-2,#f7f7f5);--rd-border:rgba(12,12,11,.12);--rd-pass:#15803d;--rd-pass-fill:#f0fdf4;--rd-warn:#b45309;--rd-warn-fill:#fffbeb;--rd-fail:#b91c1c;--rd-fail-fill:#fef2f2;--rd-info:#1d4ed8;--rd-info-fill:#eff6ff;--rd-neutral:#57534e;--rd-neutral-fill:#f5f5f4;
 position:relative;box-sizing:border-box;width:100%;aspect-ratio:16/9;overflow:hidden;display:flex;flex-direction:column;gap:${u(18)};
 padding:${u(48)} ${u(64)} ${u(72)};background:var(--rd-surface);color:var(--rd-text);
 font-family:"Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;font-size:${u(24)};line-height:1.35;letter-spacing:-.006em;font-variant-numeric:tabular-nums;
 -webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left}
.rd-slide *{box-sizing:border-box}
.rd-slide :where(p,h1,h2,h3,ol,ul,dl,dd,figure,blockquote){margin:0;padding:0}
.rd-slide :where(p,dd,li,blockquote,h1,h2,h3){overflow-wrap:anywhere}
.rd-head{display:flex;align-items:center;justify-content:space-between;gap:${u(16)}}
.rd-eyebrow{font-size:${u(18)};font-weight:500;color:var(--rd-muted)}
.rd-title{font-size:${u(44)};font-weight:600;letter-spacing:-.021em;line-height:1.12}
.rd-lead{color:var(--rd-muted)}
.rd-foot{position:absolute;left:${u(64)};right:${u(64)};bottom:${u(26)};display:flex;justify-content:space-between;gap:${u(24)};font-size:${u(16)};color:var(--rd-faint)}
.rd-foot span:first-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}
.rd-foot span:last-child{flex-shrink:0;white-space:nowrap}
.rd-chips{display:flex;flex-wrap:wrap;align-items:center;gap:${u(10)}}
.rd-chip{display:inline-flex;align-items:center;white-space:nowrap;padding:${u(4)} ${u(14)};border-radius:999px;font-size:${u(18)};font-weight:500;line-height:1.3;background:var(--rd-neutral-fill);color:var(--rd-neutral)}
.rd-chip[data-tone=pass]{background:var(--rd-pass-fill);color:var(--rd-pass)}
.rd-chip[data-tone=warn]{background:var(--rd-warn-fill);color:var(--rd-warn)}
.rd-chip[data-tone=fail]{background:var(--rd-fail-fill);color:var(--rd-fail)}
.rd-chip[data-tone=info]{background:var(--rd-info-fill);color:var(--rd-info)}
.rd-chip[data-tone=strong]{background:var(--rd-text);color:#fff}
.rd-meta-text{font-size:${u(18)};color:var(--rd-muted)}
.rd-cover{justify-content:center;gap:${u(22)}}
.rd-system{font-size:${u(64)};font-weight:600;letter-spacing:-.03em;line-height:1.05}
.rd-system[data-long]{font-size:${u(44)};letter-spacing:-.021em;line-height:1.12}
.rd-purpose{font-size:${u(28)};color:var(--rd-muted);max-width:${u(1000)}}
.rd-facts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.7fr);gap:${u(36)};margin-top:${u(18)};padding-top:${u(24)};border-top:1px solid var(--rd-border)}
.rd-facts dt{font-size:${u(18)};font-weight:500;color:var(--rd-muted);margin-bottom:${u(6)}}
.rd-status{display:grid;gap:${u(10)}}
.rd-status p{display:grid;gap:${u(4)}}
.rd-status .rd-chip{justify-self:start}
.rd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${u(48)};flex:1;min-height:0}
.rd-verdict{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:${u(56)};align-items:start}
.rd-score{font-size:${u(150)};font-weight:600;letter-spacing:-.045em;line-height:.95}
.rd-score[data-empty]{font-size:${u(44)};letter-spacing:-.021em}
.rd-score-label{margin-top:${u(12)};color:var(--rd-muted)}
.rd-score-count{margin-top:${u(18)};font-weight:600}
.rd-sentences{list-style:none;display:grid;gap:${u(16)};font-size:${u(26)};line-height:1.3}
.rd-sample-line{margin-top:${u(20)};padding-top:${u(16)};border-top:1px solid var(--rd-border);font-size:${u(20)};color:var(--rd-muted)}
.rd-col h2{font-size:${u(20)};font-weight:600;color:var(--rd-muted);margin-bottom:${u(14)}}
.rd-rows{list-style:none;display:grid;gap:${u(14)}}
.rd-row{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:${u(16)};row-gap:${u(6)};align-items:baseline}
.rd-row b{font-weight:600;white-space:nowrap}
.rd-bar{grid-column:1/-1;height:${u(10)};border-radius:999px;background:var(--rd-surface-2);overflow:hidden}
.rd-bar i{display:block;height:100%;border-radius:999px;background:var(--rd-fail)}
.rd-bar[data-tone=warn] i{background:var(--rd-warn)}
.rd-row small{grid-column:1/-1;font-size:${u(18)};color:var(--rd-fail)}
.rd-hypothesis{font-size:${u(20)};color:var(--rd-muted)}
.rd-empty{color:var(--rd-muted)}
.rd-transcript-title{font-size:${u(32)};font-weight:600;letter-spacing:-.015em;line-height:1.15}
.rd-transcript{gap:${u(40)}}
.rd-transcript-meta{margin-top:${u(10)};column-gap:${u(14)}}
.rd-block{display:grid;gap:${u(6)};align-content:start}
.rd-block+.rd-block{margin-top:${u(18)}}
.rd-label{font-size:${u(18)};font-weight:500;color:var(--rd-muted)}
.rd-quote{border-left:${u(4)} solid var(--rd-border);padding-left:${u(16)}}
.rd-excerpt{background:var(--rd-surface-2);border-radius:${u(12)};padding:${u(14)} ${u(18)}}
.rd-excerpt cite{display:block;font-style:normal;font-size:${u(18)};color:var(--rd-muted);margin-bottom:${u(4)}}
.rd-shortened{font-size:${u(16)};color:var(--rd-faint)}
.rd-fixes{list-style:none;display:grid;gap:${u(16)}}
.rd-fix{display:grid;grid-template-columns:${u(44)} minmax(0,1fr);column-gap:${u(18)};align-items:start}
.rd-rank{display:grid;place-items:center;width:${u(40)};height:${u(40)};border-radius:999px;background:var(--rd-text);color:#fff;font-size:${u(20)};font-weight:600}
.rd-fix-title{font-weight:600}
.rd-next-title{font-size:${u(48)};font-weight:600;letter-spacing:-.025em;line-height:1.1}
.rd-points{list-style:none;display:grid;gap:${u(18)};font-size:${u(28)}}
.rd-points li{display:grid;grid-template-columns:${u(40)} minmax(0,1fr);gap:${u(12)};align-items:start}
.rd-points svg{width:${u(30)};height:${u(30)};margin-top:${u(4)};fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.rd-ask{display:grid;gap:${u(6)};margin-top:auto;padding-top:${u(18)};border-top:1px solid var(--rd-border)}
.rd-ask p{font-size:${u(30)};font-weight:600}
@media (max-width:699px){
 .rd-frame:not([data-thumb]) .rd-slide{--u:.72px;aspect-ratio:auto;min-height:calc(100dvh - 160px);padding:20px 20px 56px}
 .rd-frame:not([data-thumb]) :is(.rd-grid,.rd-verdict,.rd-facts){grid-template-columns:minmax(0,1fr)}
}
`;

/** The footer of every slide: product, system and slide number. */
function foot(deck: ReadoutDeck, index: number, total: number) {
  const copy = readoutCopy(deck.locale);
  return `<footer class="rd-foot"><span>${esc(copy.footer)} · ${esc(deck.system)}</span><span data-slide-number>${index + 1} / ${total}</span></footer>`;
}
function head(deck: ReadoutDeck, eyebrow: string) {
  const copy = readoutCopy(deck.locale);
  return `<header class="rd-head"><p class="rd-eyebrow">${esc(eyebrow)}</p>${deck.sample ? `<span class="rd-chips"><span class="rd-chip" data-tone="strong">${esc(copy.sampleLabel)}</span><span class="rd-meta-text">${esc(copy.sampleNote)}</span></span>` : ""}</header>`;
}
/** Recorded text, cut to fit (the slide says once when anything was cut: `shortenedNote`). */
const text = (value: { text: string; shortened: boolean }) => esc(value.text);
function shortenedNote(deck: ReadoutDeck, values: Array<{ shortened: boolean } | null | undefined>) {
  return values.some((value) => value?.shortened) ? `<span class="rd-shortened" data-shortened>${esc(readoutCopy(deck.locale).shortened)}</span>` : "";
}
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

function body(deck: ReadoutDeck, slide: ReadoutSlide): string {
  const copy = readoutCopy(deck.locale);
  switch (slide.kind) {
    case "cover":
      return `${head(deck, copy.eyebrow)}
<h1 class="rd-system"${slide.system.length > 48 ? " data-long" : ""}>${esc(slide.system)}</h1>
${slide.purpose.text ? `<p class="rd-purpose">${text(slide.purpose)}</p>` : ""}
<dl class="rd-facts">
 <div><dt>${esc(copy.evaluated)}</dt><dd data-cover="date">${esc(slide.date)}</dd></div>
 <div><dt>${esc(copy.scope)}</dt><dd data-cover="scope">${esc(slide.scope)}</dd></div>
 <div><dt>${esc(copy.reviewStatus)}</dt><dd class="rd-status">${slide.status.map((item) => `<p data-status="${esc(item.key)}"><span class="rd-chip" data-tone="${STATUS_TONE[item.key] ?? "warn"}">${esc(item.label)}</span><span class="rd-meta-text">${esc(item.text)}</span></p>`).join("")}</dd></div>
</dl>`;
    case "verdict":
      return `${head(deck, copy.verdictTitle)}
<div class="rd-grid rd-verdict">
 <div>
  <p class="rd-score"${slide.percentText ? "" : " data-empty"} data-score>${esc(slide.percentText ?? copy.noScore)}</p>
  ${slide.percentText ? `<p class="rd-score-label">${esc(slide.grounded ? copy.scoreLabel : copy.scoreLabelPlain)}</p>` : ""}
  <p class="rd-score-count" data-count>${slide.pass} / ${slide.scored}</p>
 </div>
 <div>
  <ol class="rd-sentences">${slide.sentences.map((sentence) => `<li data-sentence="${sentence.key}">${esc(sentence.text)}</li>`).join("")}</ol>
  <p class="rd-sample-line" data-sample>${esc(slide.sample)}</p>
 </div>
</div>`;
    case "causes": {
      const rows = (items: typeof slide.causes, tone: string) =>
        `<ul class="rd-rows">${items
          .map(
            (item) => `<li class="rd-row" data-row="${esc(item.key)}"><span>${esc(item.label)}</span><b data-count>${esc(fill(copy.causeCount, { n: item.count, scored: slide.scored }))}</b><span class="rd-bar" data-tone="${tone}"><i style="width:${slide.scored ? ((item.count / slide.scored) * 100).toFixed(2) : 0}%"></i></span>${item.critical ? `<small>${esc(item.critical === 1 ? copy.criticalOne : fill(copy.criticalMany, { n: item.critical }))}</small>` : ""}</li>`,
          )
          .join("")}</ul>`;
      return `${head(deck, copy.causesTitle)}
<p class="rd-lead">${esc(fill(copy.causesLead, { scored: slide.scored }))}</p>
${slide.failing
  ? `<div class="rd-grid">
 <section class="rd-col" data-column="causes"><h2>${esc(copy.likelyCauses)}</h2>${slide.causes.length ? rows(slide.causes, "fail") : `<p class="rd-empty">${esc(copy.noLikelyCause)}</p>`}</section>
 <section class="rd-col" data-column="problems"><h2>${esc(copy.whatWentWrong)}</h2>${rows(slide.problems, "warn")}</section>
</div>
<p class="rd-hypothesis">${esc(copy.causesHypothesis)}</p>`
  : `<p class="rd-empty">${esc(copy.noFailures)}</p>`}`;
    }
    case "transcript":
      return `${head(deck, fill(copy.transcriptTitle, { index: slide.index, total: slide.total }))}
<div>
 <h1 class="rd-transcript-title">${text(slide.title)}</h1>
 <p class="rd-chips rd-transcript-meta">${slide.chips.map((chip) => `<span class="rd-chip" data-tone="${chip.tone}">${esc(chip.text)}</span>`).join("")}<span class="rd-chip" data-result-number>${esc(fill(copy.result, { number: `T${slide.number}` }))}</span><span class="rd-meta-text" data-result-id>${esc(slide.assessment_id)}</span>${slide.cause ? `<span class="rd-meta-text" data-cause>${esc(slide.cause)}</span>` : ""}${shortenedNote(deck, [slide.title, slide.question, slide.answer, slide.expected, slide.why, slide.excerpt?.text])}</p>
</div>
<div class="rd-grid rd-transcript">
 <div>
  <div class="rd-block"><span class="rd-label">${esc(copy.question)}</span><p class="rd-quote" data-question>${text(slide.question)}</p></div>
  <div class="rd-block"><span class="rd-label">${esc(copy.answer)}</span><p class="rd-quote" data-answer>${text(slide.answer)}</p></div>
 </div>
 <div>
  ${slide.excerpt
    ? `<div class="rd-block"><span class="rd-label">${esc(copy.fromSource)}</span><blockquote class="rd-excerpt" data-excerpt>${slide.excerpt.title ? `<cite>${esc(slide.excerpt.title)}</cite>` : ""}${text(slide.excerpt.text)}</blockquote></div>`
    : slide.expected
      ? `<div class="rd-block"><span class="rd-label">${esc(copy.expected)}</span><p class="rd-excerpt" data-expected>${text(slide.expected)}</p><span class="rd-meta-text">${esc(copy.noExcerpt)}</span></div>`
      : `<p class="rd-meta-text">${esc(copy.noExcerpt)}</p>`}
  <div class="rd-block"><span class="rd-label">${esc(copy.why)}</span><p data-why>${text(slide.why)}</p></div>
 </div>
</div>`;
    case "fixes":
      return `${head(deck, copy.fixesTitle)}
<p class="rd-lead">${esc(copy.fixesLead)}</p>
${slide.fixes.length
  ? `<ol class="rd-fixes">${slide.fixes
      .map(
        (fix) => `<li class="rd-fix" data-fix="${fix.rank}"><span class="rd-rank">${fix.rank}</span><div><p class="rd-fix-title">${text(fix.title)}</p><p class="rd-meta-text" data-fix-meta>${esc(fix.answers)}${fix.critical ? ` · ${esc(fix.critical === 1 ? copy.criticalOne : fill(copy.criticalMany, { n: fix.critical }))}` : ""} · ${esc(fix.basis)}</p></div></li>`,
      )
      .join("")}</ol>`
  : `<p class="rd-empty">${esc(copy.fixesNone)}</p>`}`;
    case "next":
      return `${head(deck, copy.nextTitle)}
<h1 class="rd-next-title" data-next="${slide.step}">${esc(slide.title)}</h1>
<ul class="rd-points">${slide.points.map((point) => `<li>${CHECK}<span>${esc(point)}</span></li>`).join("")}</ul>
<div class="rd-ask"><span class="rd-label">${esc(copy.nextAsk)}</span><p data-ask>${esc(slide.ask)}</p></div>`;
  }
}

/** One slide, as a self-contained `section` (styles: READOUT_CSS). */
export function renderReadoutSlide(deck: ReadoutDeck, index: number): string {
  const slide = deck.slides[index];
  return `<section class="rd-slide${slide.kind === "cover" ? " rd-cover" : ""}" data-slide="${esc(slide.key)}" data-kind="${slide.kind}" lang="${deck.locale}">${body(deck, slide)}${foot(deck, index, deck.slides.length)}</section>`;
}
