"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n/context";
import type { SectorId } from "@/lib/public/sectors";
import { CONVERSATIONS, LANDING_SECTORS } from "@/components/landing/hero-chat-data";
import {
  splitMarked,
  useAutoAdvance,
  useInView,
  usePrefersReducedMotion,
  VerdictMark,
} from "@/components/landing/marks";

/** How long one sector stays on screen before the next one plays. */
const SECTOR_SECONDS = 10;

/**
 * The hero's checked conversations. Its parent sends the messages it reads
 * with `ClientMessages` and `heroChatMessages(sectors)` (launch L-24b).
 */
export function HeroChat({ sectors = LANDING_SECTORS }: { sectors?: readonly SectorId[] }) {
  const SECTORS = sectors.map((id) => ({ id, turns: CONVERSATIONS[id] }));
  // A single conversation is a static figure, not a carousel.
  const single = SECTORS.length === 1;
  const t = useTranslations("heroChat");
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { threshold: 0.3 });
  const reducedMotion = usePrefersReducedMotion();

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [openTurn, setOpenTurn] = useState<string | null>(null);
  const [pageHidden, setPageHidden] = useState(false);

  // Ready after hydration so the server and first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
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

  // Conversations animate in only once the visitor or the timer changes
  // sector; the first one arrives with the hero's own entrance.
  const [changed, setChanged] = useState(false);

  const goTo = useCallback((next: number) => {
    setIndex(next);
    setChanged(true);
    setOpenTurn(null);
  }, []);

  // Sectors keep cycling under reduced motion too: only the movement goes.
  const held = hovering || focusInside || openTurn !== null || !inView || pageHidden;
  const count = SECTORS.length;
  const next = useCallback(() => goTo((index + 1) % count), [goTo, index, count]);
  useAutoAdvance(index, SECTOR_SECONDS * 1000, ready && !held && !single, next);

  return (
    <div
      ref={rootRef}
      className="hc"
      role="region"
      aria-roledescription={single ? undefined : t("carousel")}
      aria-label={t("label")}
      data-auto={ready && !reducedMotion && !single}
      data-held={held}
      style={{ ["--hc-time" as string]: `${SECTOR_SECONDS}s` }}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
      }}
    >
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
              aria-roledescription={single ? undefined : t("slide")}
              aria-label={
                single
                  ? t(`sectors.${item.id}.name`)
                  : `${sectorIndex + 1} / ${SECTORS.length} · ${t(`sectors.${item.id}.name`)}`
              }
              aria-hidden={!active}
              inert={!active}
              data-active={active}
              data-enter={active && changed}
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
                      <div id={noteId} className="hc-note" role="note" data-ok={ok}>
                        <p className="hc-v">
                          <VerdictMark ok={ok} />
                          <span>{t(`verdicts.${verdict}`)}</span>
                        </p>
                        <p className="hc-why">{t(`sectors.${item.id}.${turn}.why`)}</p>
                        <p className="hc-src">
                          <svg viewBox="0 0 14 16" aria-hidden="true">
                            <path d="M2.5 1.5h6l3 3v10h-9z" />
                            <path d="M5 7.5h4.5M5 10h4.5M5 12.5h3" />
                          </svg>
                          <span className="sr-only">{t("source")}: </span>
                          {t(`sectors.${item.id}.${turn}.src`)}
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

      {single ? null : (
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
      )}
    </div>
  );
}
