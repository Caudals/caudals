"use client";

import { useId } from "react";
import { usePrefersReducedMotion } from "@/components/landing/marks";
import { useTranslations } from "@/lib/i18n/context";

/** Cells answered wrong in the graded grid: [row, column]. */
const WRONG = [
  [0, 1],
  [1, 3],
  [2, 0],
] as const;

function Cells({ x, y, graded = false }: { x: number; y: number; graded?: boolean }) {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const cx = x + c * 20;
      const cy = y + r * 20;
      cells.push(<rect key={`${r}-${c}`} x={cx} y={cy} width="14" height="14" className="pp" />);
      if (graded && WRONG.some(([wr, wc]) => wr === r && wc === c)) {
        cells.push(
          <rect
            key={`${r}-${c}-x`}
            x={cx}
            y={cy}
            width="14"
            height="14"
            className="fk blink"
            style={{ animationDelay: `${r * 0.9}s` }}
          />,
        );
      }
    }
  }
  return <>{cells}</>;
}

function Docs() {
  return (
    <g className="lk">
      <rect x="22" y="40" width="26" height="34" rx="1.5" />
      <rect x="30" y="34" width="26" height="34" rx="1.5" className="pp" />
      <path d="M36 44h14M36 50h14M36 56h9" />
    </g>
  );
}

function Chat() {
  return (
    <path
      className="lk"
      d="M22 156h34a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H36l-8 7v-7h-6a4 4 0 0 1-4-4v-16a4 4 0 0 1 4-4z"
    />
  );
}

/** Two people: the expert network, not one person. */
function Experts() {
  return (
    <g className="lk">
      <circle cx="47" cy="269" r="7" className="pp" />
      <path d="M34 292c1-9 6-14 13-14s12 5 13 14z" className="pp" />
      <circle cx="29" cy="275" r="7" className="pp" />
      <path d="M16 298c1-9 6-14 13-14s12 5 13 14z" className="pp" />
    </g>
  );
}

function Report({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="lk">
        <rect x="0" y="0" width="74" height="96" rx="2" className="pp" />
        <path d="M12 16h34M12 24h50" />
      </g>
      <path className="lk" style={{ strokeWidth: 6, strokeLinecap: "butt" }} d="M16 80v-22M28 80v-34M40 80v-14M52 80v-40" />
    </g>
  );
}

function Dots({ ids, timing }: { ids: string[]; timing: readonly (readonly [number, number])[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <circle key={id} r="3" className="fk">
          <animateMotion dur={`${timing[i][0]}s`} begin={`${timing[i][1]}s`} repeatCount="indefinite">
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}

const DESK_PATHS = [
  "M206 58 C 256 58, 250 170, 300 170",
  "M206 170 L 300 170",
  "M206 282 C 256 282, 250 170, 300 170",
  "M398 170 L 533 170",
  "M617 170 L 751 170",
  "M849 170 L 963 170",
];
const MOB_PATHS = [
  "M64 86 C 64 118, 74 118, 74 150",
  "M180 86 C 180 124, 74 116, 74 150",
  "M296 86 C 296 128, 74 112, 74 150",
  "M74 216 V 268",
  "M74 332 V 380",
  "M74 446 V 486",
];
const TIMING = [
  [3.2, 0],
  [3.2, 1],
  [3.2, 2],
  [1.6, 0],
  [1.6, 0.8],
  [2.4, 0],
] as const;

/** Step 1: documents, real questions and our experts become an exam, then a graded report. */
export function PipelineDiagram() {
  const t = useTranslations("steps.how");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const moving = !usePrefersReducedMotion();
  const deskIds = DESK_PATHS.map((_, i) => `${uid}-d${i}`);
  const mobIds = MOB_PATHS.map((_, i) => `${uid}-m${i}`);

  return (
    <div className="dg dg-bare">
      <svg className="dg-desk" viewBox="0 0 1100 330" role="img" aria-label={t("figure")}>
        <defs>
          {DESK_PATHS.map((d, i) => (
            <path key={deskIds[i]} id={deskIds[i]} d={d} />
          ))}
        </defs>
        <g className="ln">
          {deskIds.map((id) => (
            <use key={id} href={`#${id}`} />
          ))}
        </g>
        <Docs />
        <Chat />
        <Experts />
        <text x="76" y="62" className="t">{t("docs")}</text>
        <text x="76" y="174" className="t">{t("questions")}</text>
        <text x="76" y="286" className="t">{t("experts")}</text>

        <Cells x={312} y={142} />
        <text x="349" y="236" className="t" textAnchor="middle">{t("exam")}</text>
        <text x="349" y="256" className="s" textAnchor="middle">{t("examNote")}</text>

        <circle cx="575" cy="170" r="34" className="lk" />
        <circle cx="575" cy="170" r="5" className="fk" />
        <text x="575" y="236" className="t" textAnchor="middle">{t("ai")}</text>
        <text x="575" y="256" className="s" textAnchor="middle">{t("aiNote")}</text>

        <Cells x={763} y={142} graded />
        <text x="800" y="236" className="t" textAnchor="middle">{t("graded")}</text>
        <text x="800" y="256" className="s" textAnchor="middle">{t("gradedNote")}</text>

        <Report x={973} y={116} />
        <text x="1010" y="236" className="t" textAnchor="middle">{t("report")}</text>
        <text x="1010" y="256" className="s" textAnchor="middle">{t("reportNote")}</text>

        {moving ? <Dots ids={deskIds} timing={TIMING} /> : null}
      </svg>

      <svg className="dg-mob" viewBox="0 0 360 590" role="img" aria-label={t("figure")}>
        <defs>
          {MOB_PATHS.map((d, i) => (
            <path key={mobIds[i]} id={mobIds[i]} d={d} />
          ))}
        </defs>
        <g className="ln">
          {mobIds.map((id) => (
            <use key={id} href={`#${id}`} />
          ))}
        </g>
        <g transform="translate(25 -26)">
          <Docs />
        </g>
        <g transform="translate(141 -143)">
          <Chat />
        </g>
        <g transform="translate(258 -252)">
          <Experts />
        </g>
        <text x="64" y="72" className="t sm" textAnchor="middle">{t("docs")}</text>
        <text x="180" y="72" className="t sm" textAnchor="middle">{t("questions")}</text>
        <text x="296" y="72" className="t sm" textAnchor="middle">{t("experts")}</text>

        <Cells x={37} y={156} />
        <text x="128" y="180" className="t">{t("exam")}</text>
        <text x="128" y="198" className="s">{t("examNote")}</text>

        <circle cx="74" cy="300" r="30" className="lk" />
        <circle cx="74" cy="300" r="5" className="fk" />
        <text x="128" y="296" className="t">{t("ai")}</text>
        <text x="128" y="314" className="s">{t("aiNote")}</text>

        <Cells x={37} y={386} graded />
        <text x="128" y="410" className="t">{t("graded")}</text>
        <text x="128" y="428" className="s">{t("gradedNote")}</text>

        <g transform="translate(41 490) scale(.9)">
          <Report x={0} y={0} />
        </g>
        <text x="128" y="528" className="t">{t("report")}</text>
        <text x="128" y="546" className="s">{t("reportNote")}</text>

        {moving ? <Dots ids={mobIds} timing={TIMING} /> : null}
      </svg>
    </div>
  );
}
