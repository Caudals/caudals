"use client";

/**
 * The estimate before every run (launch L-15, spec §6.7, P-16). Before a run
 * starts, the dialog shows what it will ask and with which models, the p50–p90
 * credits with the euro equivalent, the balance, what is held while it runs and
 * how long it should take, from POST /billing/estimates (L-10's estimator; the
 * same numbers the server admits a run against).
 *
 * The gate (§6.7): where credits are enforced, a run starts when the
 * available credits cover the p90 estimate or auto-recharge covers the gap;
 * otherwise the dialog blocks with "Add X credits" (a one-step top-up for
 * owners). Contract workspaces run on their agreement: no credit gate.
 *
 * `ModelRates` lists the models a run uses with their credit rates, and on pay
 * as you go the price list (Evaluation · Connect).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, Play } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, ActionLink, DefinitionList, Loading, Status } from "./primitives";
import { Modal } from "./overlays";
import { TopUpDialog } from "./billing-top-up";
import { formatCount, formatCredits, useBilling } from "./billing-state";
import { billingHref } from "./workspace-billing";
import { useWorkspace } from "./workspace-context";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/en";

type Role = "context_analyzer" | "generator" | "judge" | "report_writer";
/** POST /api/evals/v1/billing/estimates (lib/billing/estimate.ts, lib/billing/api.ts). */
export type RunEstimate = {
  connection: "website" | "api" | "imported";
  questions: { count: number; executions: number; judged: number; generated: number };
  credits: { p50: string; p90: string };
  euros: { p50: string; p90: string };
  largestHold: { ucr: string; credits: string };
  eta: { p50Seconds: number; p90Seconds: number; basis: "measured" | "seeded" };
  balance: { billingMode: string; requiresCredits: boolean; availableCredits: string; coversP90: boolean; addCredits: string | null } | null;
  models: Partial<Record<Role, { modelId: string; free: boolean; customerKey?: boolean; priced: boolean; rate: string | null; credits: { input: string; output: string } | null; webResearch: boolean }>>;
  gate?: { enforced: boolean; autoRechargeCovers: boolean; autoRechargePackCredits: number | null; canStart: boolean };
  lines?: Array<{ kind: "meter" | "tokens"; key: string }>;
};

const ROLE_KEY: Record<Role, MessageKey> = { context_analyzer: "roleContextAnalyzer", generator: "roleGenerator", judge: "roleJudge", report_writer: "roleReportWriter" };
const CONNECTION_KEY: Record<RunEstimate["connection"], MessageKey> = { website: "estimateConnectionWebsite", api: "estimateConnectionApi", imported: "estimateConnectionImported" };
const ROLES: Role[] = ["judge", "report_writer", "generator", "context_analyzer"];

function euro(value: string) {
  return new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { style: "currency", currency: "EUR" }).format(Number(value));
}
function decimal(value: string) {
  return new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 2 }).format(Number(value));
}
/** "12 min", "1 h 20 min". */
export function duration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return tv("estimateMinutes", { n: minutes });
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? tv("estimateHoursMinutes", { h: hours, m: rest }) : tv("estimateHours", { h: hours });
}
function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
export function rateText(credits: { input: string; output: string } | null, free = false, customerKey = false) {
  // The workspace's own provider key (launch L-27): its provider bills the tokens.
  if (customerKey) return t("estimateYourKey");
  if (free) return t("estimateFreeModel");
  return credits ? tv("estimateRate", { input: decimal(credits.input), output: decimal(credits.output) }) : t("estimateNoRate");
}

export function RunEstimateDialog({ open, onClose, evaluationId, targetRevisionId, onStart, onChangeModels }: {
  open: boolean;
  onClose: () => void;
  evaluationId: string;
  targetRevisionId: string | null;
  /** Starts the run; throws what the start API answered. */
  onStart: () => Promise<void>;
  /** Platform admins: opens the model settings. */
  onChangeModels?: () => void;
}) {
  const { orgId, withOrg } = useWorkspace();
  const { summary, refresh } = useBilling();
  const [estimate, setEstimate] = useState<RunEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<{ message: string; code: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [version, setVersion] = useState(0);
  const key = useRef(newKey());

  useEffect(() => {
    if (!open) return;
    let live = true;
    setEstimate(null); setError(null);
    // A fresh key each time: the balance may have changed since the last estimate.
    key.current = newKey();
    evalRequest<RunEstimate>("/billing/estimates", "POST", { orgId, evaluationId, ...(targetRevisionId ? { targetRevisionId } : {}) }, key.current).then(
      value => { if (live) setEstimate(value); },
      caught => { if (live) setError(caught instanceof Error ? caught.message : t("error")); },
    );
    return () => { live = false; };
  }, [open, orgId, evaluationId, targetRevisionId, version]);

  // Credits added elsewhere (another tab, auto-recharge): estimate again.
  const balance = summary?.balance.availableUcr;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!open) { seen.current = undefined; return; }
    if (seen.current !== undefined && balance !== seen.current) setVersion(value => value + 1);
    seen.current = balance;
  }, [balance, open]);

  const start = useCallback(async () => {
    setStarting(true); setStartError(null);
    try {
      await onStart();
      refresh();
      onClose();
    } catch (caught) {
      if (caught instanceof EvalRequestError) setStartError({ message: caught.message, code: caught.code });
      else setStartError({ message: caught instanceof Error ? caught.message : t("error"), code: "ERROR" });
      setVersion(value => value + 1);
    } finally { setStarting(false); }
  }, [onStart, onClose, refresh]);

  const contract = estimate?.balance?.billingMode === "contract" || summary?.billingMode === "contract";
  const enforced = estimate?.gate?.enforced ?? summary?.gate === "enforced";
  const covers = estimate?.balance ? estimate.balance.coversP90 : true;
  const recharge = Boolean(estimate?.gate?.autoRechargeCovers);
  const addCredits = estimate?.balance?.addCredits ? Number(estimate.balance.addCredits) : 0;
  const blocked = Boolean(estimate) && enforced && !contract && !covers && !recharge;
  const owner = summary?.level === "owner" && summary.payments?.access !== "closed";
  const returnTo = `/workspace/evaluations/${evaluationId}?orgId=${orgId}`;

  // The models this run calls (a run without a new test set does not draft tests or read material).
  const used = new Set((estimate?.lines ?? []).filter(line => line.kind === "tokens").map(line => line.key));
  const models = estimate ? ROLES.filter(role => estimate.models[role] && (used.size === 0 || used.has(role))) : [];
  const facts = estimate ? [
    { term: t("estimateQuestions"), value: estimate.questions.executions !== estimate.questions.count
      ? tv("estimateQuestionsRepeated", { n: formatCount(estimate.questions.count), runs: formatCount(estimate.questions.executions) })
      : tv("estimateQuestionsN", { n: formatCount(estimate.questions.count) }) },
    { term: t("estimateConnection"), value: t(CONNECTION_KEY[estimate.connection]) },
    { term: t("estimateModels"), value: (
      <ul className="p-plain-list" data-testid="estimate-models">
        {models.map(role => {
          const model = estimate.models[role]!;
          return <li key={role}><strong>{t(ROLE_KEY[role])}</strong>: {model.customerKey ? model.modelId : model.rate ?? model.modelId}{!contract && <span className="p-cell-meta"> · {rateText(model.credits, model.free, model.customerKey)}</span>}</li>;
        })}
      </ul>
    ) },
    { term: t("estimateTime"), value: tv("estimateTimeRange", { from: duration(estimate.eta.p50Seconds), to: duration(estimate.eta.p90Seconds) }) },
  ] : [];

  return (
    <>
      <Modal open={open && !topUp} onOpenChange={value => { if (!value) onClose(); }} size="lg" title={t("estimateTitle")}
        description={t("estimateDescription")}
        alert={startError ? (
          <Status error action={startError.code === "CAP_REACHED" && summary?.level === "owner" ? <ActionLink size="sm" variant="secondary" href={billingHref(withOrg, "limits")}>{t("estimateReviewLimits")}</ActionLink> : undefined}>
            {startError.message}
          </Status>
        ) : undefined}
        footer={<>
          {onChangeModels && <Action variant="ghost" onClick={() => { onClose(); onChangeModels(); }}>{t("estimateChangeModels")}</Action>}
          <Action variant="secondary" onClick={onClose} disabled={starting}>{t("cancel")}</Action>
          {blocked && owner ? (
            <Action onClick={() => setTopUp(true)} data-testid="estimate-add-credits"><CreditCard aria-hidden="true" />{tv("estimateAddCredits", { n: formatCount(addCredits) })}</Action>
          ) : (
            <Action onClick={() => void start()} disabled={starting || !estimate && !error || blocked} data-testid="estimate-start">
              <Play aria-hidden="true" />{starting ? t("starting") : t("estimateStart")}
            </Action>
          )}
        </>}
      >
        {!estimate && !error ? <Loading>{t("estimateLoading")}</Loading> : error ? (
          <Status tone="warn">{t("estimateUnavailable")}</Status>
        ) : estimate ? (
          <div className="p-estimate" data-testid="run-estimate">
            <DefinitionList items={facts} />
            {contract ? (
              <Status tone="info">{t("estimateContract")}</Status>
            ) : (
              <div className="p-estimate-cost">
                <p className="p-estimate-range" data-testid="estimate-range">
                  {tv("estimateRange", { p50: formatCount(estimate.credits.p50), p90: formatCount(estimate.credits.p90), e50: euro(estimate.euros.p50), e90: euro(estimate.euros.p90) })}
                </p>
                {estimate.balance && <p data-testid="estimate-balance">{tv("estimateYouHave", { credits: formatCredits(BigInt(Math.round(Number(estimate.balance.availableCredits) * 1_000_000))) })}</p>}
                <p className="p-cell-meta">{tv("estimateHold", { credits: formatCount(estimate.largestHold.credits) })}</p>
                <p className="p-cell-meta">{t("estimateCharged")}</p>
              </div>
            )}
            {!contract && enforced && !covers && (recharge ? (
              <Status tone="info">{tv("estimateRechargeCovers", { credits: formatCount(estimate.gate?.autoRechargePackCredits ?? 0) })}</Status>
            ) : (
              <Status tone="warn">
                {tv("estimateBlocked", { n: formatCount(addCredits) })} {owner ? null : t("estimateAskOwner")}
              </Status>
            ))}
            {estimate.eta.basis === "seeded" && <p className="p-cell-meta">{t("estimateSeeded")}</p>}
          </div>
        ) : null}
      </Modal>
      {topUp && <TopUpDialog orgId={orgId} open onClose={() => setTopUp(false)} minCredits={addCredits} returnTo={returnTo} />}
    </>
  );
}

type RatesView = {
  roles: Array<{ role: Role; modelId: string; label: string | null; free: boolean; customerKey?: boolean; input: string | null; output: string | null }>;
  catalog: Array<{ label: string; provider: string; minInputTokens: number; input: string; output: string }>;
  meters: Array<{ meter: string; unit: string; credits: string }>;
};
const METER_KEY: Record<string, MessageKey> = {
  website_question: "billingMeter_website_question", api_question: "billingMeter_api_question", graded_answer: "billingMeter_graded_answer",
  web_page_read: "billingMeter_web_page_read", document_page: "billingMeter_document_page", web_search_query: "billingMeter_web_search_query",
};

/**
 * The models an evaluation's runs use, with their credit rates (Evaluation ·
 * Connect, for customers where billing shows). On pay as you go the price list
 * too: other models are switched on with Caudals (D-09: your content goes to
 * a commercial provider only when you opt in).
 */
export function ModelRates({ evaluationId }: { evaluationId: string }) {
  const { orgId } = useWorkspace();
  const { summary } = useBilling();
  const [rates, setRates] = useState<RatesView | null>(null);
  const [failed, setFailed] = useState(false);
  const show = Boolean(summary) && summary?.billingMode !== "contract";
  useEffect(() => {
    if (!show) return;
    let live = true;
    evalRequest<RatesView>(`/billing/rates?orgId=${encodeURIComponent(orgId)}&evaluationId=${encodeURIComponent(evaluationId)}`).then(
      value => { if (live) { setRates(value); setFailed(false); } }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [show, orgId, evaluationId]);
  if (!show || failed) return null;
  if (!rates) return <Loading>{t("billingLoading")}</Loading>;
  const payg = summary?.plan === "payg";
  return (
    <section className="p-model-rates" aria-labelledby="model-rates-title" data-testid="model-rates">
      <h3 id="model-rates-title">{t("modelRatesTitle")}</h3>
      <ul className="p-plain-list">
        {rates.roles.map(role => (
          <li key={role.role}><strong>{t(ROLE_KEY[role.role])}</strong>: {role.label ?? role.modelId} <span className="p-cell-meta">· {rateText(role.input && role.output ? { input: role.input, output: role.output } : null, role.free, role.customerKey)}</span></li>
        ))}
      </ul>
      {payg ? (
        <details className="p-model-rates-list">
          <summary>{t("modelRatesCatalog")}</summary>
          <ul className="p-plain-list">
            {rates.catalog.map(item => <li key={`${item.label}-${item.minInputTokens}`}>{item.label} <span className="p-cell-meta">· {rateText(item)}</span></li>)}
            {rates.meters.map(item => <li key={item.meter}>{METER_KEY[item.meter] ? t(METER_KEY[item.meter]) : item.meter} <span className="p-cell-meta">· {tv("modelRatesMeter", { credits: decimal(item.credits) })}</span></li>)}
          </ul>
          <p className="p-cell-meta">{t("modelRatesOptIn")}</p>
        </details>
      ) : <p className="p-cell-meta">{t("modelRatesFree")}</p>}
    </section>
  );
}
