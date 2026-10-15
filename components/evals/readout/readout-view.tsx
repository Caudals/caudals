"use client";

/**
 * Readout mode (launch L-35, spec P-57): a report revision as a full-screen
 * slide sequence for a live readout, and its presenter view in a second
 * window. The slides are the same HTML as the 16:9 PDF
 * (lib/evals/reports/readout-document.ts), built only from the snapshot.
 *
 * Keyboard: ← / → and Space move, Home / End, number keys jump (two digits
 * typed quickly reach slide 10+), Esc exits, P opens the presenter view, F
 * toggles full screen. The two windows stay in step over a BroadcastChannel.
 * Presenter notes exist only for operators; owners and editors present
 * without them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Maximize, Minimize, NotebookPen, Pause, Play, Presentation, RotateCcw, X } from "lucide-react";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import type { ReportLocale } from "@/lib/evals/reports/i18n";
import { READOUT_MAX_TRANSCRIPTS, READOUT_NEXT_STEPS, buildReadoutDeck, defaultNote, defaultTranscriptIds, readoutChip, resultNumbers, slideSegment, type ReadoutNextStep } from "@/lib/evals/reports/readout";
import { READOUT_CSS, renderReadoutSlide } from "@/lib/evals/reports/readout-document";
import { readoutCopy } from "@/lib/evals/reports/readout-copy";
import { fill } from "@/lib/evals/reports/summary-copy";
import type { ReadoutAccess } from "@/lib/evals/readout/access";
import { Action, Badge, SelectField, Status, TextArea } from "../primitives";
import { SidePanel } from "../overlays";
import { readoutChannelName, timerElapsed, useReadoutSync, type ReadoutSyncState, type ReadoutTimer } from "./readout-sync";

export type ReadoutSaved = { transcriptIds: string[] | null; nextStep: ReadoutNextStep | null };
export type ReadoutSaveInput = { transcriptIds: string[] | null; nextStep: ReadoutNextStep | null; notes: Record<string, string | null> };
export type ReadoutExportState = { status: "idle" | "preparing" | "ready" | "failed" };

export type ReadoutViewProps = {
  view: "audience" | "presenter";
  locale: ReportLocale;
  snapshot: ReportSnapshot;
  revisionId: string;
  access: ReadoutAccess;
  /** The example evaluation: labelled on every slide; notes and picks stay on this device. */
  sample?: boolean;
  defaultNextStep: ReadoutNextStep;
  saved: ReadoutSaved;
  /** Operator notes by slide key (operators only). */
  notes?: Record<string, string>;
  /** Persist an operator's picks, next step and notes; resolves with what was stored. */
  onSave?: (input: ReadoutSaveInput) => Promise<{ saved: ReadoutSaved; notes: Record<string, string> }>;
  /** Start the 16:9 PDF; omitted where export is not available (the example). */
  onExport?: (choice: { transcriptIds: string[]; nextStep: ReadoutNextStep }) => Promise<void>;
  exportState?: ReadoutExportState;
  onPresented?: (slideCount: number) => void;
  /** Where Esc and Exit go. */
  onExit: () => void;
  /** URL of the presenter view for this readout. */
  presenterHref: string;
};

const subscribeNever = () => () => undefined;
const mounted = () => true;
const notMounted = () => false;
/** Seconds as m:ss. */
function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function ReadoutView(props: ReadoutViewProps) {
  const { view, locale, snapshot, revisionId, access, sample = false, defaultNextStep: fallbackStep, onExit } = props;
  const copy = readoutCopy(locale);
  const ready = useSyncExternalStore(subscribeNever, mounted, notMounted);
  const [index, setIndex] = useState(0);
  const [transcriptIds, setTranscriptIds] = useState<string[]>(() => props.saved.transcriptIds?.length ? props.saved.transcriptIds : defaultTranscriptIds(snapshot.results));
  const [nextStep, setNextStep] = useState<ReadoutNextStep>(props.saved.nextStep ?? fallbackStep);
  const [notes, setNotes] = useState<Record<string, string>>(props.notes ?? {});
  const [timer, setTimer] = useState<ReadoutTimer>(() => ({ running: view === "audience", startedAt: view === "audience" ? Date.now() : null, base: 0 }));
  const [now, setNow] = useState(() => Date.now());
  const [panel, setPanel] = useState(false);
  const [notice, setNotice] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const deck = useMemo(() => buildReadoutDeck(snapshot, locale, { transcriptIds, nextStep, sample }), [snapshot, locale, transcriptIds, nextStep, sample]);
  const total = deck.slides.length;
  const current = Math.min(index, total - 1);
  const slide = deck.slides[current];
  const html = useMemo(() => deck.slides.map((_, position) => renderReadoutSlide(deck, position)), [deck]);

  /* ------------------------------------------------------------- sync --- */
  const state = useCallback((): ReadoutSyncState => ({ index: current, timer, transcriptIds, nextStep, ...(access.notes ? { notes } : {}) }), [current, timer, transcriptIds, nextStep, notes, access.notes]);
  const sync = useReadoutSync(
    readoutChannelName(revisionId),
    state,
    (remote) => {
      setIndex(remote.index);
      setTimer(remote.timer);
      setTranscriptIds(remote.transcriptIds);
      setNextStep(remote.nextStep);
      if (access.notes && remote.notes) setNotes(remote.notes);
    },
    view === "presenter" ? () => window.close() : undefined,
  );
  const publish = sync.publish;
  const go = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(total - 1, target));
      setIndex(next);
      publish({ ...state(), index: next });
    },
    [total, publish, state],
  );
  const setTimerShared = useCallback(
    (next: ReadoutTimer) => {
      setTimer(next);
      publish({ ...state(), timer: next });
    },
    [publish, state],
  );

  /* ------------------------------------------------------------ timer --- */
  useEffect(() => {
    if (view !== "presenter") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [view]);

  /* ----------------------------------------------------- side effects --- */
  const presented = useRef(false);
  const { onPresented } = props;
  useEffect(() => {
    if (view !== "audience" || presented.current) return;
    presented.current = true;
    onPresented?.(total);
  }, [view, onPresented, total]);
  useEffect(() => {
    if (!ready) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    // The shell underneath leaves the tab order and the accessibility tree while the readout covers it.
    const shell = document.querySelector<HTMLElement>(".p-shell");
    shell?.setAttribute("inert", "");
    root.current?.focus();
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => {
      document.documentElement.style.overflow = previous;
      shell?.removeAttribute("inert");
      document.removeEventListener("fullscreenchange", change);
    };
  }, [ready]);

  const openPresenter = useCallback(() => {
    const opened = window.open(props.presenterHref, `caudals-readout-${revisionId}`, "popup,width=1280,height=800");
    setNotice(opened ? "" : copy.popupBlocked);
  }, [props.presenterHref, revisionId, copy.popupBlocked]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  const exit = useCallback(() => {
    // A presenter window closes itself; opened by hand (no opener), it leaves like the audience view.
    if (view === "presenter" && window.opener) {
      window.close();
      return;
    }
    sync.publishExit();
    if (document.fullscreenElement) void document.exitFullscreen?.();
    onExit();
  }, [view, sync, onExit]);

  /* --------------------------------------------------------- keyboard --- */
  const digit = useRef<{ value: string; at: number } | null>(null);
  useEffect(() => {
    if (panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || editable(event.target)) return;
      const key = event.key;
      let handled = true;
      if (key === "ArrowRight" || key === "PageDown" || (key === " " && !event.shiftKey)) go(current + 1);
      else if (key === "ArrowLeft" || key === "PageUp" || (key === " " && event.shiftKey)) go(current - 1);
      else if (key === "Home") go(0);
      else if (key === "End") go(total - 1);
      else if (key === "Escape") exit();
      else if (key === "p" || key === "P") {
        if (view === "audience") openPresenter();
      } else if (key === "f" || key === "F") toggleFullscreen();
      else if (/^[0-9]$/.test(key)) {
        const at = Date.now();
        const combined = digit.current && at - digit.current.at < 700 ? Number(digit.current.value + key) : NaN;
        if (combined >= 1 && combined <= total) {
          go(combined - 1);
          digit.current = null;
        } else {
          if (Number(key) >= 1 && Number(key) <= total) go(Number(key) - 1);
          digit.current = { value: key, at };
        }
      } else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, go, current, total, exit, openPresenter, toggleFullscreen, view]);

  /* -------------------------------------------------------- rendering --- */
  if (!ready) return null;
  const counter = fill(copy.slideOf, { index: current + 1, total });
  const nav = (
    <div className="p-readout-nav">
      <Action variant="ghost" shape="icon" aria-label={copy.previous} aria-keyshortcuts="ArrowLeft" disabled={current === 0} onClick={() => go(current - 1)}>
        <ChevronLeft aria-hidden="true" />
      </Action>
      <span className="p-readout-count" aria-live="polite" aria-atomic="true" data-counter>
        <span className="sr-only">{counter}</span>
        <span aria-hidden="true">
          {current + 1} / {total}
        </span>
      </span>
      <Action variant="ghost" shape="icon" aria-label={copy.next} aria-keyshortcuts="ArrowRight" disabled={current === total - 1} onClick={() => go(current + 1)}>
        <ChevronRight aria-hidden="true" />
      </Action>
    </div>
  );
  const style = <style dangerouslySetInnerHTML={{ __html: READOUT_CSS }} />;

  if (view === "presenter") {
    const next = current + 1 < total ? current + 1 : null;
    const segment = slideSegment(slide);
    const elapsed = timerElapsed(timer, now);
    const late = elapsed > segment.to * 60_000;
    const note = access.notes ? (notes[slide.key] ?? defaultNote(slide, locale)) : null;
    return createPortal(
      <div ref={root} tabIndex={-1} className="p-root p-readout" data-view="presenter" role="dialog" aria-modal="true" aria-label={copy.presenterTitle} lang={locale}>
        {style}
        <header className="p-readout-head">
          <h1 className="p-readout-title">{copy.presenterTitle}</h1>
          <span className="p-readout-meta">{counter}</span>
          <div className="p-readout-timer" role="timer" aria-label={copy.timer}>
            <span data-elapsed>{clock(elapsed)}</span>
            <Badge tone={late ? "warn" : "neutral"}>
              {copy[`segment_${segment.key}`]} · {fill(copy.planned, { from: segment.from, to: segment.to })}
            </Badge>
            <Action variant="ghost" size="sm" onClick={() => setTimerShared(timer.running ? { running: false, startedAt: null, base: timerElapsed(timer, Date.now()) } : { running: true, startedAt: Date.now(), base: timer.base })}>
              {timer.running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {timer.running ? copy.pause : copy.resume}
            </Action>
            <Action variant="ghost" size="sm" onClick={() => setTimerShared({ running: timer.running, startedAt: timer.running ? Date.now() : null, base: 0 })}>
              <RotateCcw aria-hidden="true" />
              {copy.reset}
            </Action>
          </div>
        </header>
        <div className="p-readout-presenter">
          <section className="p-readout-pane" aria-label={copy.currentSlide}>
            <h2 className="p-readout-pane-title">{copy.currentSlide}</h2>
            <div className="rd-frame p-readout-thumb" data-thumb data-current dangerouslySetInnerHTML={{ __html: html[current] }} />
          </section>
          <aside className="p-readout-side">
            <section className="p-readout-pane" aria-label={copy.nextSlide}>
              <h2 className="p-readout-pane-title">{copy.nextSlide}</h2>
              {next != null ? <div className="rd-frame p-readout-thumb" data-thumb data-upcoming dangerouslySetInnerHTML={{ __html: html[next] }} /> : <p className="p-readout-end">{copy.endOfReadout}</p>}
            </section>
            {note != null && (
              <section className="p-readout-pane" aria-label={copy.notes}>
                <h2 className="p-readout-pane-title">{copy.notes}</h2>
                <p className="p-readout-notes" data-notes>{note || copy.noNotes}</p>
              </section>
            )}
          </aside>
        </div>
        <footer className="p-readout-bar">
          <p className="p-readout-hint">{copy.presenterSynced} <span className="p-readout-keys">{copy.keyboardHelp}</span></p>
          {nav}
          <Action variant="secondary" size="sm" onClick={exit}>
            <X aria-hidden="true" />
            {copy.exit}
          </Action>
        </footer>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div ref={root} tabIndex={-1} className="p-root p-readout" data-view="audience" role="dialog" aria-modal="true" aria-roledescription={copy.slidesRole} aria-label={`${copy.present}: ${deck.system}`} lang={locale}>
      {style}
      <div className="p-readout-stage">
        <div key={current} className="rd-frame p-readout-slide" data-current dangerouslySetInnerHTML={{ __html: html[current] }} />
      </div>
      <footer className="p-readout-bar">
        <div className="p-readout-group">
          <Action variant="ghost" size="sm" onClick={exit} aria-keyshortcuts="Escape">
            <X aria-hidden="true" />
            {copy.exit}
          </Action>
        </div>
        {nav}
        <div className="p-readout-group">
          <Action variant="ghost" size="sm" onClick={() => setPanel(true)}>
            <NotebookPen aria-hidden="true" />
            {access.edit ? copy.prepare : copy.nextStep}
          </Action>
          <Action variant="ghost" size="sm" onClick={openPresenter} aria-keyshortcuts="P">
            <Presentation aria-hidden="true" />
            {copy.presenterView}
          </Action>
          <Action variant="ghost" size="sm" shape="icon" className="p-btn p-readout-fullscreen" onClick={toggleFullscreen} aria-keyshortcuts="F" aria-label={copy.fullScreen} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </Action>
          {props.onExport && (
            <Action variant="ghost" size="sm" disabled={props.exportState?.status === "preparing"} onClick={() => void props.onExport?.({ transcriptIds: deck.transcriptIds, nextStep })}>
              <Download aria-hidden="true" />
              {props.exportState?.status === "preparing" ? copy.exportPreparing : copy.exportPdf}
            </Action>
          )}
        </div>
      </footer>
      {(notice || props.exportState?.status === "failed") && (
        <div className="p-readout-notice">
          <Status tone="warn">{notice || copy.exportFailed}</Status>
        </div>
      )}
      <ReadoutPanel
        open={panel}
        onOpenChange={setPanel}
        locale={locale}
        snapshot={snapshot}
        access={access}
        sample={sample}
        transcriptIds={transcriptIds}
        nextStep={nextStep}
        notes={notes}
        slides={deck.slides}
        onApply={async (input) => {
          if (access.edit && props.onSave) {
            const stored = await props.onSave(input);
            const ids = stored.saved.transcriptIds?.length ? stored.saved.transcriptIds : defaultTranscriptIds(snapshot.results);
            const step = stored.saved.nextStep ?? fallbackStep;
            setTranscriptIds(ids);
            setNextStep(step);
            setNotes(stored.notes);
            publish({ ...state(), transcriptIds: ids, nextStep: step, notes: stored.notes });
          } else {
            const step = input.nextStep ?? fallbackStep;
            setNextStep(step);
            publish({ ...state(), nextStep: step });
          }
        }}
      />
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------- panel --- */

/**
 * Notes and transcripts (operators, saved per revision) and the next step
 * (everyone who presents; only operators save it).
 */
function ReadoutPanel({
  open,
  onOpenChange,
  locale,
  snapshot,
  access,
  sample,
  transcriptIds,
  nextStep,
  notes,
  slides,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: ReportLocale;
  snapshot: ReportSnapshot;
  access: ReadoutAccess;
  sample: boolean;
  transcriptIds: string[];
  nextStep: ReadoutNextStep;
  notes: Record<string, string>;
  slides: ReturnType<typeof buildReadoutDeck>["slides"];
  onApply: (input: ReadoutSaveInput) => Promise<void>;
}) {
  const copy = readoutCopy(locale);
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={access.edit ? copy.prepareTitle : copy.nextStep} description={access.edit ? copy.prepareLead : copy.nextStepHelp} wide={access.edit}>
      {open && <PanelForm key={`${transcriptIds.join(",")}:${nextStep}`} {...{ locale, snapshot, access, sample, transcriptIds, nextStep, notes, slides, onApply }} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function PanelForm({
  locale,
  snapshot,
  access,
  sample,
  transcriptIds,
  nextStep,
  notes,
  slides,
  onApply,
  onDone,
}: {
  locale: ReportLocale;
  snapshot: ReportSnapshot;
  access: ReadoutAccess;
  sample: boolean;
  transcriptIds: string[];
  nextStep: ReadoutNextStep;
  notes: Record<string, string>;
  slides: ReturnType<typeof buildReadoutDeck>["slides"];
  onApply: (input: ReadoutSaveInput) => Promise<void>;
  onDone: () => void;
}) {
  const copy = readoutCopy(locale);
  const [picks, setPicks] = useState(transcriptIds);
  const [step, setStep] = useState(nextStep);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const numbers = useMemo(() => resultNumbers(snapshot.results), [snapshot.results]);
  const options = useMemo(
    () =>
      [...snapshot.results]
        .sort((a, b) => (numbers.get(a.assessment_id) ?? 0) - (numbers.get(b.assessment_id) ?? 0))
        .map((item) => ({ id: item.assessment_id, label: `T${numbers.get(item.assessment_id)} · ${readoutChip(item.label ?? item.outcome, locale).text} · ${item.title}`.slice(0, 140) })),
    [snapshot.results, numbers, locale],
  );
  // Notes follow the slides in this order; transcript slides as currently picked.
  const noteSlides = slides.map((slide) => ({ key: slide.key, kind: slide.kind, title: slide.kind === "transcript" ? fill(copy.transcriptSlot, { index: slide.index }) : slideName(slide.kind, locale) }));
  const value = (key: string, kind: (typeof slides)[number]["kind"]) => (key in draft ? (draft[key] ?? defaultNote({ kind }, locale)) : (notes[key] ?? defaultNote({ kind }, locale)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const chosen = picks.join(",") === defaultTranscriptIds(snapshot.results).join(",") ? null : picks;
      await onApply({ transcriptIds: access.edit ? chosen : null, nextStep: step, notes: access.edit ? draft : {} });
      onDone();
    } catch {
      setError(copy.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="p-stack" onSubmit={submit} data-readout-panel>
      {access.edit && <Status tone="info">{sample ? copy.notesLocal : copy.notesPrivate}</Status>}
      <SelectField id="readout-next-step" label={copy.nextStep} hint={copy.nextStepHelp} value={step} onChange={(event) => setStep(event.target.value as ReadoutNextStep)}>
        {READOUT_NEXT_STEPS.map((option) => (
          <option key={option} value={option}>
            {option === "pilot" ? copy.pilot : copy.subscription}
          </option>
        ))}
      </SelectField>
      {access.edit && (
        <fieldset className="p-readout-fieldset">
          <legend>{copy.transcripts}</legend>
          <p className="p-field-hint">{copy.transcriptsHelp}</p>
          {picks.map((id, position) => (
            <div className="p-readout-pick" key={`${position}:${id}`}>
              <SelectField
                id={`readout-pick-${position}`}
                label={fill(copy.transcriptSlot, { index: position + 1 })}
                value={id}
                onChange={(event) => setPicks((current) => current.map((item, at) => (at === position ? event.target.value : item)))}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id} disabled={option.id !== id && picks.includes(option.id)}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              {picks.length > 1 && (
                <Action variant="ghost" size="sm" shape="icon" aria-label={fill(copy.removeTranscript, { index: position + 1 })} onClick={() => setPicks((current) => current.filter((_, at) => at !== position))}>
                  <X aria-hidden="true" />
                </Action>
              )}
            </div>
          ))}
          <div className="p-readout-actions">
            {picks.length < Math.min(READOUT_MAX_TRANSCRIPTS, options.length) && (
              <Action variant="secondary" size="sm" onClick={() => setPicks((current) => [...current, options.find((option) => !current.includes(option.id))!.id])}>
                + {fill(copy.transcriptSlot, { index: picks.length + 1 })}
              </Action>
            )}
            <Action variant="ghost" size="sm" onClick={() => setPicks(defaultTranscriptIds(snapshot.results))}>
              <RotateCcw aria-hidden="true" />
              {copy.resetTranscripts}
            </Action>
          </div>
        </fieldset>
      )}
      {access.notes && (
        <fieldset className="p-readout-fieldset">
          <legend>{copy.notes}</legend>
          {noteSlides.map((slide) => (
            <div key={slide.key} className="p-readout-note">
              <TextArea id={`readout-note-${slide.key}`} label={slide.title} rows={3} maxLength={4000} value={value(slide.key, slide.kind)} onChange={(event) => setDraft((current) => ({ ...current, [slide.key]: event.target.value }))} />
              <Action variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, [slide.key]: null }))}>
                {copy.resetScript}
              </Action>
            </div>
          ))}
        </fieldset>
      )}
      {error && <Status error>{error}</Status>}
      <div className="p-readout-actions">
        <Action type="submit" disabled={busy}>
          {busy ? copy.saving : access.edit ? copy.save : copy.apply}
        </Action>
      </div>
    </form>
  );
}

function slideName(kind: string, locale: ReportLocale) {
  const copy = readoutCopy(locale);
  return kind === "cover" ? copy.eyebrow : kind === "verdict" ? copy.verdictTitle : kind === "causes" ? copy.causesTitle : kind === "fixes" ? copy.fixesTitle : copy.nextTitle;
}
