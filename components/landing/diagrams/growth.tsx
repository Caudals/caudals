"use client";

import { useRef } from "react";
import { useInView } from "@/components/landing/marks";
import { useTranslations } from "@/lib/i18n/context";

const PILOT_ROWS = 6; // 150 questions, five to a square, five squares to a row
const MONTHS = 6;

/** Step 5: the exam starts with the pilot's 150 questions and grows by 25 a month. */
export function GrowthChart() {
  const t = useTranslations("steps.improve");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, threshold: 0.4 });

  const columns = Array.from({ length: MONTHS + 1 }, (_, c) => {
    const rows = PILOT_ROWS + c;
    // Top row first: the newest questions sit on top of the stack.
    const cells = [];
    for (let r = rows - 1; r >= 0; r--) {
      const kind = r < PILOT_ROWS ? "" : r === rows - 1 ? "n" : "b";
      for (let k = 0; k < 5; k++) cells.push({ key: `${r}-${k}`, kind, r: rows - 1 - r });
    }
    return { c, total: 150 + 25 * c, cells };
  });

  return (
    <div ref={ref} className="gr" data-in={inView} role="img" aria-label={t("figure")}>
      <div className="gr-cols" aria-hidden="true">
        {columns.map(({ c, total, cells }) => (
          <div key={c} className="gr-col">
            <span className="gr-n">{total}</span>
            <div className="gr-stack">
              {cells.map((cell) => (
                <i
                  key={cell.key}
                  className={cell.kind || undefined}
                  style={{ ["--c" as string]: c, ["--r" as string]: cell.r }}
                />
              ))}
            </div>
            <span className="gr-x">{c === 0 ? t("pilot") : t("month", { n: c })}</span>
          </div>
        ))}
      </div>
      <ul className="gr-legend" aria-hidden="true">
        <li>
          <i />
          {t("legendPilot")}
        </li>
        <li>
          <i className="b" />
          {t("legendBefore")}
        </li>
        <li>
          <i className="n" />
          {t("legendNow")}
        </li>
        <li className="unit">{t("unit")}</li>
      </ul>
    </div>
  );
}
