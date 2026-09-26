"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n/context";
import {
  splitMarked,
  useAutoAdvance,
  useInView,
  usePrefersReducedMotion,
  VerdictMark,
} from "@/components/landing/marks";

type Verdict = "correct" | "invented" | "outdated" | "wrongSource" | "gap" | "outOfScope";

/**
 * Sectors of our first customers, each a short conversation with one assistant.
 * The copy lives in `heroChat.sectors.*`; this table holds only the order and
 * the verdict our check gives each answer.
 */
const SECTORS = [
  { id: "insurance", turns: [["t1", "invented"], ["t2", "correct"], ["t3", "outOfScope"]] },
  { id: "legal", turns: [["t1", "invented"], ["t2", "correct"], ["t3", "outOfScope"]] },
  { id: "energy", turns: [["t1", "correct"], ["t2", "wrongSource"], ["t3", "outOfScope"]] },
  { id: "banking", turns: [["t1", "gap"], ["t2", "correct"], ["t3", "outOfScope"]] },
  { id: "telecom", turns: [["t1", "outdated"], ["t2", "correct"], ["t3", "invented"]] },
] as const satisfies readonly {
  id: string;
  turns: readonly (readonly ["t1" | "t2" | "t3", Verdict])[];
}[];

/** How long one sector stays on screen before the next one plays. */
const SECTOR_SECONDS = 10;
const LEAVE_MS = 350;

export function HeroChat() {
  const t = useTranslations("heroChat");
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { threshold: 0.3 });
  const reducedMotion = usePrefersReducedMotion();

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [openTurn, setOpenTurn] = useState<string | null>(null);
  const [pageHidden, setPageHidden] = useState(false);

  // A different sector on every visit: chosen after hydration, so the server
  // and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIndex(Math.floor(Math.random() * SECTORS.length));
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const update = () => setPageHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // A tapped answer stays open until the next tap elsewhere.
  useEffect(() => {
    if (!openTurn) return;
    const close = (event: PointerEvent) => {
      const row = (event.target as Element | null)?.closest?.("[data-turn]");
      if (row?.getAttribute("data-turn") !== openTurn) setOpenTurn(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openTurn]);

  const goTo = useCallback((next: number) => {
    setLeaving(true);
    window.setTimeout(() => {
      setIndex(next);
      setOpenTurn(null);
      setLeaving(false);
    }, LEAVE_MS);
  }, []);

  // Sectors keep cycling under reduced motion too: only the movement goes.
  const held = paused || hovering || focusInside || openTurn !== null || !inView || pageHidden;
  const sector = SECTORS[index];
  const next = useCallback(() => goTo((index + 1) % SECTORS.length), [goTo, index]);
  useAutoAdvance(index, SECTOR_SECONDS * 1000, ready && !held && !leaving, next);

  return (
    <div
      ref={rootRef}
      className="hc"
      role="region"
      aria-roledescription="carousel"
      aria-label={t("label")}
      data-auto={ready && !reducedMotion}
      data-held={held}
      style={{ ["--hc-time" as string]: `${SECTOR_SECONDS}s` }}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
      }}
    >
      <noscript>
        <style>{".hc-conv .hc-u,.hc-conv .hc-row{animation:none!important}"}</style>
      </noscript>

      <div className="hc-head">
        <p className="hc-sector">
          <b>{t(`sectors.${sector.id}.name`)}</b>
          <span>{t(`sectors.${sector.id}.channel`)}</span>
        </p>
        <div className="hc-ctrl">
          <div className="hc-dots" role="group" aria-label={t("sectorsLabel")}>
            {SECTORS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className="hc-dot"
                aria-label={t("show", { sector: t(`sectors.${item.id}.name`) })}
                aria-current={i === index}
                onClick={() => i !== index && goTo(i)}
              >
                <i />
              </button>
            ))}
          </div>
          {ready ? (
            <button
              type="button"
              className="hc-pause"
              aria-label={paused ? t("play") : t("pause")}
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? (
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2.5 1.2v7.6L8.8 5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <rect x="2" y="1.5" width="2.2" height="7" rx=".4" />
                  <rect x="5.8" y="1.5" width="2.2" height="7" rx=".4" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Every sector sits in the same grid cell, so the chat always takes the
          height of the longest conversation and never shifts the page. */}
      <div className="hc-body" aria-live={held ? "polite" : "off"}>
        {SECTORS.map((item, sectorIndex) => {
          const active = sectorIndex === index;
          return (
            <div
              key={item.id}
              className="hc-conv"
              role="group"
              aria-roledescription="slide"
              aria-label={`${sectorIndex + 1} / ${SECTORS.length} · ${t(`sectors.${item.id}.name`)}`}
              aria-hidden={!active}
              inert={!active}
              data-active={active}
              data-play={ready && inView}
              data-leaving={active && leaving}
            >
              {item.turns.map(([turn, verdict], i) => {
                const turnKey = `${item.id}-${turn}`;
                const noteId = `${uid}-${turnKey}`;
                const ok = verdict === "correct";
                const answer = splitMarked(t(`sectors.${item.id}.${turn}.a`));
                const isOpen = openTurn === turnKey;

                return (
                  <div
                    key={turnKey}
                    className={i === item.turns.length - 1 ? "hc-x is-last" : "hc-x"}
                    style={{ ["--i" as string]: i }}
                  >
                    <p className="hc-u">{t(`sectors.${item.id}.${turn}.q`)}</p>
                    <div className="hc-row" data-turn={turnKey} data-open={isOpen}>
                      <button
                        type="button"
                        className="hc-a"
                        aria-expanded={isOpen}
                        aria-controls={noteId}
                        onClick={() => setOpenTurn(isOpen ? null : turnKey)}
                      >
                        {answer.before}
                        {answer.marked ? (
                          <span className={ok ? undefined : "hc-err"}>{answer.marked}</span>
                        ) : null}
                        {answer.after}
                      </button>
                      <VerdictMark ok={ok} className="hc-mark" />
                      <div id={noteId} className="hc-note" role="note">
                        <p className="hc-v">
                          <VerdictMark ok={ok} />
                          <span>{t(`verdicts.${verdict}`)}</span>
                        </p>
                        <p className="hc-why">{t(`sectors.${item.id}.${turn}.why`)}</p>
                        <p className="hc-src">
                          {t("source")}: {t(`sectors.${item.id}.${turn}.src`)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="hc-hint">
        <span className="pointer">{t("hintPointer")}</span>
        <span className="touch">{t("hintTouch")}</span>
      </p>
    </div>
  );
}
