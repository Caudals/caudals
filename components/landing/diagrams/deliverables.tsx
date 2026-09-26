"use client";

import { useTranslations } from "@/lib/i18n/context";

/** A sheet of paper with a soft shadow: the base of every deliverable. */
function Sheet({ x, y, w, h, r = 2 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <>
      <rect x={x + 3} y={y + 4} width={w} height={h} rx={r} className="shadow" />
      <rect x={x} y={y} width={w} height={h} rx={r} className="sheet" />
    </>
  );
}

function Report({ tag, score }: { tag: string; score: string }) {
  return (
    <>
      <rect x="76" y="16" width="112" height="150" rx="2" className="sheet back" />
      <Sheet x={62} y={8} w={112} h={152} />
      <text x="74" y="28" className="s">{tag}</text>
      <text x="73" y="66" className="score">33/40</text>
      <text x="74" y="80" className="s">{score}</text>
      {[58, 38, 20, 20].map((w, i) => (
        <g key={i}>
          <rect x="74" y={96 + i * 11} width="18" height="3" className="bar" />
          <rect x="98" y={95 + i * 11} width={w} height="5" className="fk" />
        </g>
      ))}
      <path className="rule" d="M74 146h86M74 152h60" />
    </>
  );
}

function Exam({ tag }: { tag: string }) {
  const rows = [70, 92, 58, 84, 76, 64];
  const wrong = [1, 4];
  return (
    <>
      <Sheet x={24} y={16} w={192} h={148} />
      <text x="38" y="37" className="s">{tag}</text>
      <path className="lk" d="M38 46h164" />
      {rows.map((w, i) => {
        const y = 62 + i * 16;
        const bad = wrong.includes(i);
        return (
          <g key={i}>
            <text x="38" y={y + 2} className="s num">
              {String(i + 1).padStart(3, "0")}
            </text>
            <rect x="66" y={y - 2} width={w} height="3" className="bar" />
            {bad ? (
              <circle cx="196" cy={y} r="5" className="fk" />
            ) : (
              <circle cx="196" cy={y} r="4.4" className="ok" />
            )}
            {i < rows.length - 1 ? <path className="rule" d={`M38 ${y + 8}h164`} /> : null}
          </g>
        );
      })}
    </>
  );
}

function Readout() {
  return (
    <>
      <rect x="29" y="22" width="188" height="118" rx="6" className="shadow" />
      <rect x="26" y="18" width="188" height="118" rx="6" className="sheet frame" />
      <path className="frame-line" d="M106 136l-4 18h36l-4-18M90 154h60" />
      <rect x="40" y="32" width="70" height="5" className="fk" />
      <rect x="40" y="43" width="46" height="3" className="bar" />
      {[
        [44, 26, "bar"],
        [62, 44, "fk"],
        [80, 20, "bar"],
        [98, 54, "fk"],
      ].map(([x, h, c]) => (
        <rect key={x} x={x} y={122 - (h as number)} width="12" height={h} className={c as string} />
      ))}
      <path className="rule" d="M40 122h78" />
      {[32, 80].map((y) => (
        <g key={y}>
          <rect x="140" y={y} width="60" height="40" rx="3" className="tile" />
          <circle cx="170" cy={y + 15} r="6" className="person" />
          <path d={`M158 ${y + 40}c1.5-8 6-11 12-11s10.5 3 12 11`} className="person" />
        </g>
      ))}
    </>
  );
}

function Alerts({ tag, text }: { tag: string; text: string }) {
  return (
    <>
      <rect x="46" y="18" width="168" height="62" rx="10" className="sheet back" />
      <Sheet x={26} y={46} w={188} h={100} r={10} />
      <circle cx="46" cy="68" r="6" className="fk" />
      <text x="60" y="72" className="s ink">{tag}</text>
      <text x="40" y="98" className="alert">{text}</text>
      <path className="lk" d="M40 130l24-4 24-4 24-5 24 13 24-15 32-5" />
      <circle cx="136" cy="130" r="3.5" className="fk" />
    </>
  );
}

const ITEMS = ["report", "exam", "readout", "alerts"] as const;

/** Step 4: the report, the exam, the walkthrough and the monthly alerts. */
export function Deliverables() {
  const t = useTranslations("steps.deliver");

  const art = {
    report: <Report tag={t("reportTag")} score={t("reportScore")} />,
    exam: <Exam tag={t("examTag")} />,
    readout: <Readout />,
    alerts: <Alerts tag={t("alertTag")} text={t("alertText")} />,
  };

  return (
    <div className="dl dg" role="list" aria-label={t("figure")}>
      {ITEMS.map((id, i) => (
        <figure key={id} role="listitem">
          <svg viewBox="0 0 240 172" aria-hidden="true">
            {art[id]}
          </svg>
          <figcaption>
            <i aria-hidden="true">{i + 1}</i>
            <b>{t(`items.${id}.name`)}</b>
            <span>{t(`items.${id}.description`)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
