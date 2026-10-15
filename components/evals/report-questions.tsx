"use client";

/**
 * "Pregunta a tu informe" — ask your report (launch L-36, spec P-58). A
 * secondary action in the report heading opens a side panel: the typical
 * cost and the limits before the first question, the questions asked about
 * this revision with their answers, and a field to ask another. Every answer
 * sentence is followed by its citations, T (results) and F (findings)
 * references that close the panel and open that evidence. Answers, fixed
 * refusals and failures are shown in the language of the question; the rest
 * of the panel follows the interface language. Not on share links.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, Trash2 } from "lucide-react";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { methodologyUrl } from "@/lib/evals/public-links";
import { trackProductEvent } from "@/lib/analytics/funnel-events";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Chip, Loading, Status, TextArea } from "./primitives";
import { Modal, notify, SidePanel } from "./overlays";

type Language = "en" | "es";
type QuestionStatus = "queued" | "answered" | "refused" | "unanswerable" | "failed" | "timed_out";
export interface QuestionView {
  id: string;
  revisionId: string;
  question: string;
  language: Language;
  status: QuestionStatus;
  reason: string | null;
  sentences: Array<{ text: string; refs: Array<{ kind: "result" | "finding"; id: string; label: string }> }> | null;
  credits: string | null;
  createdAt: string;
  finishedAt: string | null;
}
export interface QuestionsState {
  enabled: boolean;
  canAsk: boolean;
  canDelete: boolean;
  limits: { perReportDay: number; usedToday: number; freeMonth: number | null; usedMonth: number | null; remaining: number };
  cost: { basis: "credits" | "contract" | "own_key" | "free_model" | "unavailable"; typicalCredits: string | null; maxCredits: string | null; typicalEuro: string | null };
  questions: QuestionView[];
}

const MAX_CHARS = 500;
const POLL_MS = 2000;
/** The engine closes a question still waiting after five minutes; a running call has three more. */
const LONG_WAIT_MS = 5 * 60_000, STOP_POLLING_MS = 10 * 60_000;
const ERRORS: Record<string, MessageKey> = {
  CREDITS_EXHAUSTED: "rqNoCredits",
  REPORT_QUESTION_MODEL_UNAVAILABLE: "rqModelUnavailable",
  REPORT_QUESTION_MODEL_NOT_PERMITTED: "rqModelNotPermitted",
  RATE_LIMITED: "rqRateLimited",
};

const credits = (value: string, locale = getLocale()) => (value === "1" ? t("rqCreditOne", locale) : tv("rqCreditMany", { n: value }, locale));

function errorText(error: unknown, limits: QuestionsState["limits"] | undefined): string {
  if (error instanceof EvalRequestError) {
    if (error.code === "REPORT_QUESTION_DAILY_LIMIT") return tv("rqLimitDay", { max: limits?.perReportDay ?? 20 });
    if (error.code === "REPORT_QUESTION_MONTHLY_LIMIT") return tv("rqLimitMonth", { max: limits?.freeMonth ?? 10 });
    if (ERRORS[error.code]) return t(ERRORS[error.code]);
    return error.message;
  }
  return t("rqError");
}

export function ReportQuestions({
  orgId,
  reportId,
  revisionId,
  snapshot,
  readoutHref,
  onOpenResult,
  onOpenFinding,
}: {
  orgId: string;
  reportId: string;
  revisionId: string;
  snapshot: Partial<ReportSnapshot>;
  /** The booking page for "Book a readout" in the fixed refusal. */
  readoutHref?: string | null;
  onOpenResult: (assessmentId: string) => void;
  onOpenFinding: (findingId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<QuestionsState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [askError, setAskError] = useState("");
  const [removing, setRemoving] = useState<QuestionView | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const titles = useMemo(() => new Map<string, string>([
    ...(snapshot.results ?? []).map((item) => [item.assessment_id, item.input || item.title] as [string, string]),
    ...(snapshot.findings ?? []).map((item) => [item.id, item.title] as [string, string]),
  ]), [snapshot.results, snapshot.findings]);

  const base = `/reports/${reportId}/questions`;
  const load = useCallback(async () => {
    try {
      const value = await evalRequest<QuestionsState>(`${base}?orgId=${encodeURIComponent(orgId)}&revisionId=${encodeURIComponent(revisionId)}`);
      setState(value);
      setLoadError("");
    } catch (error) {
      // A workspace without the feature answers 404: the action stays hidden.
      if (error instanceof EvalRequestError && error.status === 404) setState(null);
      else setLoadError(t("rqLoadError"));
    }
  }, [base, orgId, revisionId]);
  useEffect(() => { void load(); }, [load]);

  // Poll the questions the engine is still answering.
  const pending = state?.questions.filter((item) => item.status === "queued").map((item) => item.id).join(",") ?? "";
  useEffect(() => {
    if (!pending) return;
    let live = true;
    const timer = window.setInterval(() => {
      for (const id of pending.split(",")) {
        void evalRequest<QuestionView>(`${base}/${id}?orgId=${encodeURIComponent(orgId)}`).then((question) => {
          if (!live) return;
          const stale = Date.now() - new Date(question.createdAt).getTime() > STOP_POLLING_MS;
          if (question.status !== "queued" || stale) {
            setState((current) => current && { ...current, questions: current.questions.map((item) => (item.id === question.id ? question : item)) });
            if (question.status !== "queued") void load();
          }
        }).catch(() => undefined);
      }
    }, POLL_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, [pending, base, orgId, load]);

  if (!state || (!state.enabled && !state.questions.length)) return null;

  async function ask(text: string) {
    const question = text.replace(/\s+/g, " ").trim();
    if (!question || sending || !state) return;
    setSending(true);
    setAskError("");
    try {
      const created = await evalRequest<QuestionView>(base, "POST", { orgId, revisionId, question, locale: getLocale() });
      setState((current) => current && { ...current, questions: [...current.questions, created] });
      setDraft("");
      if (created.status !== "queued") void load();
    } catch (error) {
      setAskError(errorText(error, state.limits));
    } finally {
      setSending(false);
    }
  }

  async function remove(question: QuestionView) {
    try {
      await evalRequest(`${base}/${question.id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      setState((current) => current && { ...current, questions: current.questions.filter((item) => item.id !== question.id) });
      notify(t("rqDeleted"));
    } catch (error) {
      notify(errorText(error, state?.limits));
    } finally {
      setRemoving(null);
    }
  }

  function openEvidence(ref: { kind: "result" | "finding"; id: string }) {
    setOpen(false);
    if (ref.kind === "result") onOpenResult(ref.id);
    else onOpenFinding(ref.id);
  }

  const { limits, cost } = state;
  const waiting = state.questions.some((item) => item.status === "queued");
  const full = limits.remaining <= 0;
  const limitLine = limits.freeMonth !== null && limits.usedMonth !== null && limits.freeMonth - limits.usedMonth < limits.perReportDay - limits.usedToday
    ? tv("rqLimitsMonth", { used: limits.usedMonth, max: limits.freeMonth })
    : tv("rqLimitsDay", { used: limits.usedToday, max: limits.perReportDay });

  return (
    <>
      <Action ref={trigger} variant="secondary" onClick={() => { setOpen(true); window.setTimeout(() => field.current?.focus(), 60); }} title={t("rqOpenHelp")} data-report-questions>
        <MessageSquareText aria-hidden="true" />
        {t("rqOpen")}
      </Action>
      <SidePanel open={open} onOpenChange={setOpen} wide title={t("rqTitle")} description={t("rqDescription")} returnFocus={() => trigger.current}>
        <div className="p-qa" data-questions-panel>
          {loadError && <Status error action={<Action variant="secondary" size="sm" onClick={() => void load()}>{t("retry")}</Action>}>{loadError}</Status>}
          {!state.questions.length && (
            <section className="p-qa-intro" aria-labelledby="rq-intro-title">
              <h3 id="rq-intro-title">{t("rqEmptyTitle")}</h3>
              <p>{t("rqEmptyBody")}</p>
              {state.canAsk && (
                <div className="p-qa-suggestions" role="group" aria-label={t("rqSuggestions")}>
                  {(["rqSuggestion1", "rqSuggestion2", "rqSuggestion3"] as const).map((key) => (
                    <Chip key={key} type="button" disabled={sending || full} onClick={() => void ask(t(key))}>{t(key)}</Chip>
                  ))}
                </div>
              )}
            </section>
          )}
          {state.questions.length > 0 && (
            <section aria-label={t("rqHistory")}>
              <ol className="p-qa-thread" aria-live="polite">
                {state.questions.map((question) => (
                  <li key={question.id} className="p-qa-item" data-question={question.status}>
                    <div className="p-qa-question">
                      <p lang={question.language}>{question.question}</p>
                      {state.canDelete && (
                        <Action variant="ghost" shape="icon" size="sm" aria-label={t("rqDelete")} title={t("rqDelete")} onClick={() => setRemoving(question)}>
                          <Trash2 aria-hidden="true" />
                        </Action>
                      )}
                    </div>
                    <Answer question={question} titles={titles} readoutHref={readoutHref} onOpen={openEvidence} />
                  </li>
                ))}
              </ol>
              <p className="p-qa-meta">{t("rqRefsNote")}</p>
            </section>
          )}
          {state.canAsk ? (
            <form className="p-qa-form" onSubmit={(event) => { event.preventDefault(); void ask(draft); }}>
              <TextArea ref={field} id="report-question" label={t("rqLabel")} placeholder={t("rqPlaceholder")} rows={3} maxLength={MAX_CHARS} value={draft}
                onChange={(event) => setDraft(event.target.value)} disabled={full}
                onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void ask(draft); } }}
                hint={tv("rqCount", { n: draft.length, max: MAX_CHARS })} />
              {askError && <Status error>{askError}</Status>}
              {full && !askError && <Status tone="warn">{limits.freeMonth !== null && limits.usedMonth !== null && limits.usedMonth >= limits.freeMonth ? tv("rqLimitMonth", { max: limits.freeMonth }) : tv("rqLimitDay", { max: limits.perReportDay })}</Status>}
              <div className="p-qa-form-foot">
                <CostNote cost={cost} limitLine={limitLine} />
                <Action type="submit" disabled={sending || waiting || full || !draft.trim()} aria-busy={sending}>
                  {sending ? t("rqAsking") : t("rqAsk")}
                </Action>
              </div>
            </form>
          ) : (
            <p className="p-qa-meta">{state.enabled ? t("rqViewerNote") : null}</p>
          )}
        </div>
      </SidePanel>
      <Modal open={!!removing} onOpenChange={(value) => { if (!value) setRemoving(null); }} title={t("rqDeleteTitle")} description={t("rqDeleteBody")} size="sm"
        footer={<>
          <Action variant="secondary" onClick={() => setRemoving(null)}>{t("cancel")}</Action>
          <Action variant="danger" onClick={() => removing && void remove(removing)}>{t("delete")}</Action>
        </>} />
    </>
  );
}

function CostNote({ cost, limitLine }: { cost: QuestionsState["cost"]; limitLine: string }) {
  const line = cost.basis === "credits" && cost.typicalCredits && cost.maxCredits
    ? `${tv("rqCostLine", { typical: credits(cost.typicalCredits), euro: (cost.typicalEuro ?? "0.00").replace(".", getLocale() === "es" ? "," : "."), max: credits(cost.maxCredits) })} ${t("rqCostRefund")}`
    : cost.basis === "contract" ? t("rqCostContract")
    : cost.basis === "own_key" ? t("rqCostOwnKey")
    : cost.basis === "free_model" ? t("rqCostFree")
    : null;
  return (
    <div className="p-qa-cost" data-question-cost={cost.basis}>
      {line && <span>{line}</span>}
      <span>{limitLine}</span>
    </div>
  );
}

/** A sentence's citations; a number about the whole report can cite every result, so long lists start folded. */
const FOLDED = 6;
function Cites({ refs, titles, onOpen }: { refs: NonNullable<QuestionView["sentences"]>[number]["refs"]; titles: Map<string, string>; onOpen: (ref: { kind: "result" | "finding"; id: string }) => void }) {
  const [all, setAll] = useState(false);
  const shown = all || refs.length <= FOLDED + 1 ? refs : refs.slice(0, FOLDED);
  return (
    <span className="p-cites" role="group" aria-label={t("rqEvidenceFor")}>
      {shown.map((ref) => (
        <button key={`${ref.kind}-${ref.id}`} type="button" className="p-cite" data-cite={ref.label}
          aria-label={tv(ref.kind === "result" ? "rqOpenResult" : "rqOpenFinding", { ref: ref.label, title: titles.get(ref.id) ?? ref.label })}
          title={titles.get(ref.id) ?? undefined} onClick={() => onOpen(ref)}>
          {ref.label}
        </button>
      ))}
      {shown.length < refs.length && (
        <button type="button" className="p-cite" aria-label={tv("rqMoreRefs", { n: refs.length - shown.length })} onClick={() => setAll(true)}>
          +{refs.length - shown.length}
        </button>
      )}
    </span>
  );
}

const FIXED: Partial<Record<QuestionStatus, MessageKey>> = { unanswerable: "rqUnanswerable", failed: "rqFailed", timed_out: "rqTimedOut", refused: "rqRefusal" };

function Answer({ question, titles, readoutHref, onOpen }: {
  question: QuestionView;
  titles: Map<string, string>;
  readoutHref?: string | null;
  onOpen: (ref: { kind: "result" | "finding"; id: string }) => void;
}) {
  const language = question.language;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (question.status !== "queued") return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [question.status]);
  if (question.status === "queued") {
    const long = now - new Date(question.createdAt).getTime() > LONG_WAIT_MS;
    return <Loading>{long ? t("rqWaitingLong") : t("rqWaiting")}</Loading>;
  }
  if (question.status === "answered" && question.sentences) {
    return (
      <div className="p-qa-answer" lang={language} data-answer>
        {question.sentences.map((sentence, index) => (
          <p key={index}>
            {sentence.text}
            <Cites refs={sentence.refs} titles={titles} onOpen={onOpen} />
          </p>
        ))}
        {question.credits && <p className="p-qa-meta">{tv("rqCharged", { credits: credits(question.credits) })}</p>}
      </div>
    );
  }
  const key = FIXED[question.status] ?? "rqUnanswerable";
  return (
    <div className="p-qa-answer" lang={language} data-fixed={question.status}>
      <p className="p-qa-fixed">{t(key, language)}</p>
      {question.status === "refused" && (
        <p className="p-qa-links">
          <a href={methodologyUrl(language)} target="_blank" rel="noopener noreferrer">{t("rqRefusalMethodology", language)}</a>
          {readoutHref && (
            <a href={readoutHref} target="_blank" rel="noopener noreferrer" onClick={() => void trackProductEvent("readout_link_clicked", { surface: "report" })}>
              {t("bookReadout", language)}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
