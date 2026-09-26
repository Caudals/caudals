"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import {
  useInView,
  usePrefersReducedMotion,
  VerdictMark,
} from "@/components/landing/marks";
import { useTranslations } from "@/lib/i18n/context";

type CauseId = "invented" | "outdated" | "wrongSource" | "gap" | "outOfScope";

/** Line icons, one per cause, drawn on a 26 × 26 grid. */
const ICONS: Record<CauseId, ReactNode> = {
  // a speech bubble with a spark: said with confidence, backed by nothing
  invented: (
    <>
      <path d="M4 5h18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M13 8.2v5.6M10.2 11h5.6" />
    </>
  ),
  // a page with a clock: the right document, the wrong year
  outdated: (
    <>
      <path d="M5 2.5h11l4 4V16" />
      <path d="M5 2.5v21h8" />
      <circle cx="19" cy="19.5" r="4.5" />
      <path d="M19 17.3v2.4l1.6 1" />
    </>
  ),
  // two pages, the one picked is not the one that answers
  wrongSource: (
    <>
      <rect x="2.5" y="4" width="11" height="15" rx="1" />
      <rect x="12.5" y="7" width="11" height="15" rx="1" />
      <path d="M5.5 9h5M5.5 12h5M15.5 12h5M15.5 15h5" />
    </>
  ),
  // a page that was never written
  gap: (
    <>
      <rect x="5" y="2.5" width="16" height="21" rx="1" className="d" />
      <path d="M13 10v4M13 17v.1" />
    </>
  ),
  // a person: this one should have gone to someone
  outOfScope: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M2.5 23c.6-5.4 3.4-8.2 7.5-8.2 2.3 0 4.2.9 5.5 2.6" />
      <path d="M17 16.5h7M21 13.5l3 3-3 3" />
    </>
  ),
};

const CAUSES: readonly CauseId[] = ["invented", "outdated", "wrongSource", "gap", "outOfScope"];
const CAUSE_SECONDS = 7;

/** Step 2: the five ways an AI gets it wrong, each shown as one exam question. */
export function FailureModes() {
  const t = useTranslations("steps.exam");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { threshold: 0.35 });
  const reducedMotion = usePrefersReducedMotion();

  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const cause = CAUSES[active];
  const auto = !reducedMotion;
  const held = hovering || focusInside || !inView;

  const select = (index: number, focus = false) => {
    const next = (index + CAUSES.length) % CAUSES.length;
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const doc = t(`causes.${cause}.example.doc`);
  const isGap = cause === "gap";

  return (
    <div
      ref={rootRef}
      className="fw"
      data-auto={auto}
      data-held={held}
      style={{ ["--fw-time" as string]: `${CAUSE_SECONDS}s` }}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
      }}
    >
      <p className="lp-label" id={`${uid}-label`}>
        {t("causesLabel")}
      </p>
      <div className="fw-tabs" role="tablist" aria-labelledby={`${uid}-label`}>
        {CAUSES.map((id, i) => (
          <button
            key={id}
            ref={(node) => {
              tabRefs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${id}`}
            aria-selected={i === active}
            aria-controls={`${uid}-panel`}
            tabIndex={i === active ? 0 : -1}
            className="fw-tab"
            onClick={() => select(i)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") select(i + 1, true);
              if (event.key === "ArrowLeft") select(i - 1, true);
            }}
          >
            <i
              aria-hidden="true"
              onAnimationEnd={i === active && auto ? () => select(active + 1) : undefined}
            />
            <svg viewBox="0 0 26 26" aria-hidden="true">
              {ICONS[id]}
            </svg>
            <b>{t(`causes.${id}.name`)}</b>
            <span>{t(`causes.${id}.description`)}</span>
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${cause}`}
        className="fw-card"
        // Remounted per cause, so its entrance plays each time.
        key={cause}
        data-enter={!reducedMotion}
      >
        <div className="fw-q">
          <p>{t(`causes.${cause}.example.q`)}</p>
        </div>
        <div className="fw-cmp">
          <div className="fw-side">
            <p className="lp-label">{t("aiAnswer")}</p>
            <p className="fw-ans">
              <VerdictMark ok={false} />
              <s>{t(`causes.${cause}.example.a`)}</s>
            </p>
          </div>
          <span className="fw-neq" aria-hidden="true">
            ≠
          </span>
          <div className="fw-side">
            <p className="lp-label">{t("key")}</p>
            <div className={isGap ? "fw-doc is-empty" : "fw-doc"}>
              <p className="fw-src">{t(`causes.${cause}.example.src`)}</p>
              <p>{isGap ? doc : <mark>{doc}</mark>}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
