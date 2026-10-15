"use client";

/**
 * Repeatable service (spec WP-13): scheduled reruns of an approved test set,
 * their outcomes, and the customer's own integrations — scoped read-only API
 * tokens and signed webhooks. Secrets are shown exactly once.
 *
 * Launch L-18 (spec v2 P-24, P-25, §6.7, §6.10): where the workspace pays with
 * credits (pay as you go), a schedule is weekly or monthly, shows its estimate
 * per run and per month, and may carry a monthly credit limit (owners); a run
 * the balance or a limit cannot cover is skipped and owners are alerted. Each
 * outcome shows the score against last time and the newly broken questions.
 *
 * Launch L-19 (P-25, P-27, P-28), with INTEGRATIONS_V2_ENABLED: a schedule may
 * carry its own release-gate pass threshold; Developers adds CI tokens,
 * Slack/Teams/email destinations with "Send test", and test-set thresholds.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, KeyRound, Plus, Webhook } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, EmptyState, Field, RowTitle, SectionHeading, SelectField, Status, StatusBadge, Time, codeText } from "./primitives";
import { ActionMenu, CopyField, Modal, notify } from "./overlays";
import type { WorkspaceSummary } from "./workspace-data";
import { openLimitDialog, usePlanSummary } from "./limit-dialog";
import { HelpLink } from "./help";
import { useWorkspace } from "./workspace-context";
import { formatCount, formatCredits, useBilling } from "./billing-state";
import type { RunEstimate } from "./run-estimate-dialog";
import { comparisonReasons, scorePercent } from "./run-comparison";
import { monthlyProjection } from "@/lib/evals/monitoring/projection";
import { DESTINATION_TYPES, type DestinationType } from "@/lib/evals/monitoring/customer-api";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

type Schedule = {
  id: string;
  evaluation_id: string;
  target_revision_id: string;
  suite_version_id: string;
  timezone: string;
  cadence: string;
  local_time: string;
  max_run_spend: string;
  source_max_age_days: number | null;
  status: string;
  reason_code: string | null;
  next_due_at: string;
  version: number;
  latest_dispatch_status: string | null;
  latest_dispatch_reason: string | null;
  latest_alert_status: string | null;
  /** The schedule's monthly credit limit (µcr), launch L-18. */
  credit_cap_ucr?: string | null;
  /** The release gate's pass threshold for this schedule's runs (%), launch L-19. */
  gate_threshold?: number | null;
};
type Summary = { comparable: boolean; reasons: string[]; candidate: { reportId: string | null; score: { pass: number; scored: number } }; baseline: { score: { pass: number; scored: number } } | null; newlyBrokenTotal: number } | null;
type Alert = { id: string; schedule_id: string; candidate_run_id: string; status: string; reason_codes: string[]; created_at: string; summary?: Summary };

/** Dispatch reasons in words (launch L-18); anything else is humanised. */
const REASON: Record<string, MessageKey> = {
  credits_exhausted: "scheduleReasonCreditsExhausted", cap_reached: "scheduleReasonCapReached", overlap_skipped: "scheduleReasonOverlap",
  suite_changed: "scheduleReasonSuiteChanged", sources_stale: "scheduleReasonSourcesStale", monthly_budget_exhausted: "scheduleReasonBudget",
  schedule_not_funded: "scheduleReasonNotIncluded", dispatch_failed: "scheduleReasonFailed", manual_pause: "scheduleReasonPaused",
};
const reasonText = (code: string) => (REASON[code] ? t(REASON[code]) : codeText(code));
/** "€2.70–€3.40" in the interface language. */
function euroRange(euros: { p50: string; p90: string }) {
  const format = new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { style: "currency", currency: "EUR" });
  return `${format.format(Number(euros.p50))}–${format.format(Number(euros.p90))}`;
}
type Endpoint = {
  id: string; label: string; url: string | null; events: string[]; enabled: boolean; failed_deliveries: number;
  /** Launch L-19: the destination type, its masked target and the last test send. */
  destination_type?: DestinationType; target_hint?: string | null; locale?: string;
  last_test_at?: string | null; last_test_status?: "delivered" | "failed" | null; last_test_reason?: string | null; last_test_http_status?: number | null;
};
/** An approved test set and its release-gate threshold (launch L-19). */
type Gate = { evaluation_id: string; evaluation_title: string; suite_version_id: string; target_revision_id: string | null; suite_id: string; suite_title: string; gate_threshold: number | null };
type Token = { id: string; name: string; scopes: string[]; expires_at: string; revoked_at: string | null };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function MonitoringSchedules({ orgId, canManage, summary, integrationsV2 = false }: { orgId: string; canManage: boolean; summary: WorkspaceSummary; integrationsV2?: boolean }) {
  const { withOrg } = useWorkspace();
  // Launch L-18: on credits (billing shows and the workspace is not on a contract), schedules use credits.
  const { summary: billing } = useBilling();
  const credits = !!billing && billing.billingMode !== "contract";
  const owner = billing?.level === "owner";
  const [creditCap, setCreditCap] = useState("");
  const [estimate, setEstimate] = useState<{ key: string; value: RunEstimate | null; failed: boolean } | null>(null);
  const [capFor, setCapFor] = useState<Schedule | null>(null);
  const [capValue, setCapValue] = useState("");
  // Launch L-19: the schedule's own release-gate threshold.
  const [gateThreshold, setGateThreshold] = useState("");
  const [gateFor, setGateFor] = useState<Schedule | null>(null);
  const [gateValue, setGateValue] = useState("");
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [evaluationId, setEvaluationId] = useState("");
  const [targetRevisionId, setTargetRevisionId] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [localTime, setLocalTime] = useState("09:00");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [maxRunSpend, setMaxRunSpend] = useState("");
  const [sourceMaxAgeDays, setSourceMaxAgeDays] = useState("");
  // Plans v2 (launch L-14): where scheduling is not in the plan, say what unlocks it.
  const { plan } = usePlanSummary(orgId, canManage && !summary.entitlement.can_schedule);

  const eligible = summary.evaluations.filter((item) => item.preparation_status === "ready" && item.selected_suite_version_id);
  const evaluation = eligible.find((item) => item.id === evaluationId) ?? eligible[0];
  const systems = summary.systems.filter((item) => (evaluation?.selected_target_id ? item.id === evaluation.selected_target_id : item.project_id === evaluation?.project_id) && item.document.kind !== "imported_responses");
  const selectedTarget = systems.find((item) => item.target_revision_id === targetRevisionId) ?? systems[0];
  const current = useMemo(() => new Map(summary.evaluations.map((item) => [item.id, item])), [summary.evaluations]);
  const effectiveCadence = credits && cadence === "daily" ? "weekly" : cadence;

  // The estimate for the chosen evaluation and system (§6.7: per run plus a monthly projection).
  const estimateKey = open && credits && evaluation && selectedTarget ? `${evaluation.id}|${selectedTarget.target_revision_id}` : "";
  useEffect(() => {
    if (!estimateKey || !evaluation || !selectedTarget) return;
    let live = true;
    void evalRequest<RunEstimate>("/billing/estimates", "POST", { orgId, evaluationId: evaluation.id, suiteVersionId: evaluation.selected_suite_version_id, targetRevisionId: selectedTarget.target_revision_id }, crypto.randomUUID())
      .then((value) => live && setEstimate({ key: estimateKey, value, failed: false }))
      .catch(() => live && setEstimate({ key: estimateKey, value: null, failed: true }));
    return () => { live = false; };
  }, [estimateKey, evaluation, orgId, selectedTarget]);
  const shownEstimate = estimate?.key === estimateKey ? estimate : null;
  const perRun = shownEstimate?.value ? { p50: Number(shownEstimate.value.credits.p50), p90: Number(shownEstimate.value.credits.p90) } : null;
  const projection = perRun ? monthlyProjection(effectiveCadence, perRun) : null;
  const capBelowRun = !!perRun && creditCap !== "" && Number(creditCap) < perRun.p90;

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      evalRequest<Schedule[]>(`/schedules?orgId=${encodeURIComponent(orgId)}`),
      evalRequest<Alert[]>(`/alerts?orgId=${encodeURIComponent(orgId)}`),
    ]);
    setSchedules(s);
    setAlerts(a);
  }, [orgId]);
  useEffect(() => {
    void refresh().catch((value) => {
      setSchedules([]);
      setError(value instanceof Error ? value.message : t("error"));
    });
  }, [refresh]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      notify(success);
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evaluation || !selectedTarget) return;
    const gate = integrationsV2 ? parseThreshold(gateThreshold) : null;
    if (gate === undefined) {
      setError(t("gateThresholdHint"));
      return;
    }
    const ok = await mutate(
      () =>
        evalRequest(
          "/schedules",
          "POST",
          {
            orgId,
            evaluationId: evaluation.id,
            targetRevisionId: selectedTarget.target_revision_id,
            suiteVersionId: evaluation.selected_suite_version_id,
            timezone,
            cadence: effectiveCadence,
            localTime,
            weekday: effectiveCadence === "weekly" ? weekday : null,
            dayOfMonth: effectiveCadence === "monthly" ? dayOfMonth : null,
            maxRunSpend: credits ? String(Number(evaluation.commercial_cap)) : maxRunSpend || String(Number(evaluation.commercial_cap)),
            currency: evaluation.currency,
            sourceMaxAgeDays: sourceMaxAgeDays ? Number(sourceMaxAgeDays) : null,
            ...(credits && owner && creditCap ? { creditCapCredits: Number(creditCap) } : {}),
            ...(gate !== null ? { gateThreshold: gate } : {}),
          },
          crypto.randomUUID(),
        ),
      t("scheduleCreated"),
    );
    if (ok) {
      setOpen(false);
      setCreditCap("");
      setGateThreshold("");
    }
  }

  async function saveCap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capFor) return;
    const ok = await mutate(() => evalRequest(`/schedules/${capFor.id}`, "PATCH", { orgId, expectedVersion: capFor.version, creditCapCredits: capValue ? Number(capValue) : null }), t("scheduleCapSaved"));
    if (ok) setCapFor(null);
  }

  async function saveGate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gateFor) return;
    const threshold = parseThreshold(gateValue);
    if (threshold === undefined) {
      setError(t("gateThresholdHint"));
      return;
    }
    const ok = await mutate(() => evalRequest(`/schedules/${gateFor.id}`, "PATCH", { orgId, expectedVersion: gateFor.version, gateThreshold: threshold }), t("gateThresholdSaved"));
    if (ok) setGateFor(null);
  }

  const canCreate = summary.entitlement.can_schedule && !!evaluation && !!selectedTarget;
  return (
    <section>
      <div className="p-section-head">
        <div className="p-head-text">
          <h2>{t("scheduledRuns")}</h2>
          <p>{t("scheduledRunsHelp")}</p>
        </div>
        <HelpLink topic="monitoring" />
        {canManage && (
          <Action variant="secondary" onClick={() => setOpen(true)} disabled={!canCreate}>
            <Plus aria-hidden="true" />
            {t("newSchedule")}
          </Action>
        )}
      </div>
      {!summary.entitlement.can_schedule && (
        <Status action={plan && canManage ? (
          <button type="button" className="p-text-button" onClick={() => openLimitDialog("schedules")}>{t("limitSeeWhatUnlocks")}</button>
        ) : undefined}>{t("schedulingDisabled")}</Status>
      )}
      {summary.entitlement.can_schedule && canManage && !eligible.length && <Status>{t("scheduleNeedsApprovedSet")}</Status>}
      {error && <Status error>{error}</Status>}
      {schedules === null ? (
        <p className="p-cell-meta">{t("loading")}</p>
      ) : schedules.length ? (
        <DataTable caption={t("scheduledRuns")} headers={[t("evaluation"), t("timing"), t("nextRun"), t("statusLabel"), { label: t("actions"), align: "end", hidden: true }]}>
          {schedules.map((item) => {
            const approved = current.get(item.evaluation_id)?.selected_suite_version_id;
            const drift = !!approved && approved !== item.suite_version_id;
            return (
              <tr key={item.id}>
                <RowTitle meta={drift ? t("approvedSuiteChanged") : undefined}>{current.get(item.evaluation_id)?.title ?? t("evaluation")}</RowTitle>
                <td>
                  {t(item.cadence === "daily" ? "daily" : item.cadence === "weekly" ? "weekly" : "monthly")} · {String(item.local_time).slice(0, 5)}
                  <span className="p-cell-meta p-cell-note">{item.timezone}</span>
                  {item.credit_cap_ucr && <span className="p-cell-meta p-cell-note" data-testid="schedule-cap">{tv("scheduleCapLabel", { cap: formatCredits(item.credit_cap_ucr) })}</span>}
                  {integrationsV2 && item.gate_threshold != null && <span className="p-cell-meta p-cell-note" data-testid="schedule-gate">{tv("scheduleGateLabel", { n: percentLabel(item.gate_threshold) })}</span>}
                </td>
                <td className="p-cell-meta">
                  <Time value={item.next_due_at} />
                </td>
                <td>
                  <StatusBadge value={item.status} />
                  {(item.reason_code || item.latest_dispatch_reason) && <span className="p-cell-meta p-cell-note" data-testid="schedule-reason">{reasonText(item.reason_code ?? item.latest_dispatch_reason ?? "")}</span>}
                </td>
                <td className="p-table-action">
                  {canManage && (
                    <ActionMenu
                      label={t("actions")}
                      items={[
                        {
                          label: item.status === "active" ? t("pause") : t("resume"),
                          onSelect: () => void mutate(() => evalRequest(`/schedules/${item.id}`, "PATCH", { orgId, expectedVersion: item.version, status: item.status === "active" ? "paused" : "active" }), t("scheduleUpdated")),
                        },
                        ...(drift
                          ? [{ label: t("useApprovedSuite"), onSelect: () => void mutate(() => evalRequest(`/schedules/${item.id}`, "PATCH", { orgId, expectedVersion: item.version, suiteVersionId: approved }), t("scheduleUsesApproved")) }]
                          : []),
                        ...(credits && owner
                          ? [{ label: t("scheduleEditCap"), onSelect: () => { setCapFor(item); setCapValue(item.credit_cap_ucr ? String(Number(BigInt(item.credit_cap_ucr) / BigInt(1_000_000))) : ""); } }]
                          : []),
                        ...(integrationsV2
                          ? [{ label: t("scheduleGateEdit"), onSelect: () => { setError(""); setGateFor(item); setGateValue(item.gate_threshold == null ? "" : String(item.gate_threshold)); } }]
                          : []),
                      ]}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState title={t("noSchedules")} icon={<CalendarClock />}>
          <p>{t("noSchedulesHelp")}</p>
        </EmptyState>
      )}

      {alerts.length > 0 && (
        <div className="p-section">
          <SectionHeading title={t("monitoringOutcomes")}>{t("monitoringOutcomesHelp")}</SectionHeading>
          <DataTable caption={t("monitoringOutcomes")} headers={[t("when"), t("outcome"), t("monitorScore"), t("monitorDetails")]}>
            {alerts.map((item) => {
              const s = item.summary;
              const now = s ? scorePercent(s.candidate.score) : "—";
              return (
                <tr key={item.id}>
                  <RowTitle href={s?.candidate.reportId ? withOrg(`/workspace/reports/${s.candidate.reportId}`) : undefined}>
                    <Time value={item.created_at} />
                  </RowTitle>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td data-testid="outcome-score">
                    {s && s.baseline && s.comparable ? tv("monitorScoreChange", { now, before: scorePercent(s.baseline.score) }) : now}
                  </td>
                  <td className="p-cell-meta">
                    {s && !s.comparable
                      ? (s.baseline ? `${t("monitorNotComparable")}: ${comparisonReasons(s.reasons)}` : t("monitorFirstRun"))
                      : s && s.newlyBrokenTotal
                        ? (s.newlyBrokenTotal === 1 ? t("monitorNewlyBrokenOne") : tv("monitorNewlyBroken", { n: s.newlyBrokenTotal }))
                        : item.reason_codes.map(codeText).join(", ") || "—"}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("newSchedule")}
        description={credits ? t("newScheduleHelpCredits") : t("newScheduleHelp")}
        alert={error && open ? <Status error>{error}</Status> : undefined}
        size="lg"
        footer={
          <>
            <Action variant="secondary" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Action>
            <Action type="submit" form="schedule-form" disabled={busy || !canCreate}>
              {t("createSchedule")}
            </Action>
          </>
        }
      >
        <form id="schedule-form" className="p-stack" onSubmit={createSchedule}>
          <div className="p-grid-2 p-form-grid">
            <SelectField id="monitor-evaluation" label={t("evaluation")} value={evaluation?.id ?? ""} onChange={(event) => { setEvaluationId(event.target.value); setTargetRevisionId(""); setMaxRunSpend(""); }}>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </SelectField>
            <SelectField id="monitor-system" label={t("system")} value={selectedTarget?.target_revision_id ?? ""} onChange={(event) => setTargetRevisionId(event.target.value)}>
              {systems.map((item) => (
                <option key={item.target_revision_id} value={item.target_revision_id}>{item.title}</option>
              ))}
            </SelectField>
            <SelectField id="monitor-cadence" label={t("cadence")} value={effectiveCadence} onChange={(event) => setCadence(event.target.value as typeof cadence)}>
              {!credits && <option value="daily">{t("daily")}</option>}
              <option value="weekly">{t("weekly")}</option>
              <option value="monthly">{t("monthly")}</option>
            </SelectField>
            {effectiveCadence === "weekly" && (
              <SelectField id="monitor-weekday" label={t("weekday")} value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index + 1}>{day}</option>
                ))}
              </SelectField>
            )}
            {effectiveCadence === "monthly" && <Field id="monitor-day" label={t("dayOfMonth")} type="number" min={1} max={31} value={dayOfMonth} onChange={(event) => setDayOfMonth(Number(event.target.value))} required />}
            <Field id="monitor-time" label={t("localTime")} type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} required />
            <Field id="monitor-zone" label={t("timezone")} value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
            {!credits && <Field id="monitor-spend" label={`${t("maxRunSpend")} (${evaluation?.currency ?? summary.entitlement.currency})`} inputMode="decimal" value={maxRunSpend || (evaluation?.commercial_cap ? String(Number(evaluation.commercial_cap)) : "")} onChange={(event) => setMaxRunSpend(event.target.value)} required />}
            <Field id="monitor-freshness" label={t("maxSourceAge")} type="number" min={1} max={3650} value={sourceMaxAgeDays} onChange={(event) => setSourceMaxAgeDays(event.target.value)} hint={t("optional")} />
          </div>
          {credits && (
            <div className="p-schedule-estimate" data-testid="schedule-estimate" aria-live="polite">
              <p className="p-eyebrow">{t("scheduleEstimateTitle")}</p>
              {!shownEstimate ? <p className="p-cell-meta">{t("scheduleEstimateLoading")}</p>
                : !shownEstimate.value || !perRun || !projection ? <p className="p-cell-meta">{t("scheduleEstimateUnavailable")}</p>
                  : <>
                    <p>{tv("scheduleEstimatePerRun", { p50: formatCount(perRun.p50), p90: formatCount(perRun.p90), euros: euroRange(shownEstimate.value.euros) })}</p>
                    <p>{projection.runs.max === 1
                      ? tv("scheduleEstimateMonthlyOne", { low: formatCount(projection.low), high: formatCount(projection.high) })
                      : tv("scheduleEstimateMonthly", { low: formatCount(projection.low), high: formatCount(projection.high), min: projection.runs.min, max: projection.runs.max })}</p>
                    {shownEstimate.value.balance && <p className="p-cell-meta">{tv("scheduleEstimateBalance", { balance: formatCount(Math.floor(Number(shownEstimate.value.balance.availableCredits))) })}</p>}
                  </>}
              {owner && <Field id="monitor-credit-cap" label={t("scheduleCreditCap")} type="number" min={1} step={1} inputMode="numeric" value={creditCap} onChange={(event) => setCreditCap(event.target.value)} hint={t("scheduleCreditCapHint")} />}
              {capBelowRun && <Status tone="warn">{t("scheduleCreditCapBelow")}</Status>}
              <p className="p-field-hint">{t("scheduleCreditsCadenceHelp")} {t("scheduleEstimateHelp")}</p>
            </div>
          )}
          {integrationsV2 && <Field id="monitor-gate" label={t("gateThresholdField")} inputMode="decimal" value={gateThreshold} onChange={(event) => setGateThreshold(event.target.value)} hint={t("scheduleGateDialogHelp")} />}
          <p className="p-field-hint">{t("scheduleSlotHelp")}</p>
        </form>
      </Modal>
      <Modal
        open={!!capFor}
        onOpenChange={(value) => !value && setCapFor(null)}
        title={t("scheduleEditCap")}
        description={t("scheduleCapDialogHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={() => setCapFor(null)}>{t("cancel")}</Action>
            <Action type="submit" form="schedule-cap-form" disabled={busy}>{t("scheduleCapSave")}</Action>
          </>
        }
      >
        <form id="schedule-cap-form" onSubmit={saveCap}>
          <Field id="schedule-cap" label={t("scheduleCreditCap")} type="number" min={1} step={1} inputMode="numeric" value={capValue} onChange={(event) => setCapValue(event.target.value)} hint={t("scheduleCreditCapHint")} />
        </form>
      </Modal>
      <Modal
        open={!!gateFor}
        onOpenChange={(value) => !value && setGateFor(null)}
        title={t("scheduleGateEdit")}
        description={t("scheduleGateDialogHelp")}
        alert={error && gateFor ? <Status error>{error}</Status> : undefined}
        footer={
          <>
            <Action variant="secondary" onClick={() => setGateFor(null)}>{t("cancel")}</Action>
            <Action type="submit" form="schedule-gate-form" disabled={busy}>{t("save")}</Action>
          </>
        }
      >
        <form id="schedule-gate-form" onSubmit={saveGate}>
          <Field id="schedule-gate" label={t("gateThresholdField")} inputMode="decimal" value={gateValue} onChange={(event) => setGateValue(event.target.value)} hint={t("gateThresholdHint")} />
        </form>
      </Modal>
    </section>
  );
}

/** "Gate at 80%" / "80,5 %" in the interface language. */
const percentLabel = (value: number) => new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 2 }).format(value);
/** A threshold typed in a field: empty removes it; otherwise 0–100 with at most two decimals. */
function parseThreshold(value: string): number | null | undefined {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 100 && Math.round(number * 100) === number * 100 ? number : undefined;
}

/** Why the last test send failed, in words. */
function testReason(item: Pick<Endpoint, "last_test_reason" | "last_test_http_status">) {
  switch (item.last_test_reason) {
    case "destination_denied": return t("testReasonDenied");
    case "http_error": return tv("testReasonHttp", { status: item.last_test_http_status ?? "?" });
    case "redirect_rejected": return t("testReasonRedirect");
    case "email_unavailable": return t("testReasonEmail");
    default: return t("testReasonDelivery");
  }
}
const DESTINATION_LABEL: Record<DestinationType, MessageKey> = {
  slack: "destinationSlack", teams: "destinationTeams", email: "destinationEmail", webhook: "destinationWebhook",
};
const DESTINATION_HELP: Record<DestinationType, MessageKey> = {
  slack: "destinationSlackHelp", teams: "destinationTeamsHelp", email: "destinationEmailHelp", webhook: "destinationWebhookHelp",
};
/** Regressions and runs that could not finish, or every outcome. */
const ALERT_EVENTS = ["regression", "run_unknown", "run_partial"];
const ALL_EVENTS = ["run_completed", "run_partial", "run_unknown", "regression", "inconclusive"];

/**
 * Settings → Developers: API tokens, signed webhooks and, with integrations v2
 * (launch L-19, P-27, P-28; `integrationsV2` is INTEGRATIONS_V2_ENABLED read
 * on the server), CI tokens that start runs, Slack/Teams/email destinations
 * with "Send test", and the release gate's thresholds per test set.
 */
export function DeveloperAccess({ orgId, canManage, integrationsV2 = false }: { orgId: string; canManage: boolean; integrationsV2?: boolean }) {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [gates, setGates] = useState<Gate[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"" | "token" | "webhook">("");
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [tokenScope, setTokenScope] = useState("runs:read");
  const [destinationType, setDestinationType] = useState<DestinationType>("slack");
  const [deleteFor, setDeleteFor] = useState<Endpoint | null>(null);
  const [gateFor, setGateFor] = useState<Gate | null>(null);
  const [gateValue, setGateValue] = useState("");
  const ci = integrationsV2 && tokenScope === "ci";

  const refresh = useCallback(async () => {
    const [e, k, g] = await Promise.all([
      evalRequest<Endpoint[]>(`/webhooks?orgId=${encodeURIComponent(orgId)}`),
      evalRequest<Token[]>(`/tokens?orgId=${encodeURIComponent(orgId)}`),
      integrationsV2 ? evalRequest<Gate[]>(`/gates?orgId=${encodeURIComponent(orgId)}`) : Promise.resolve(null),
    ]);
    setEndpoints(e);
    setTokens(k);
    setGates(g);
  }, [orgId, integrationsV2]);
  useEffect(() => {
    void refresh().catch((value) => {
      setEndpoints([]);
      setTokens([]);
      setGates([]);
      setError(value instanceof Error ? value.message : t("error"));
    });
  }, [refresh]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      notify(success);
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function createToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const scope = String(data.get("scope"));
      const result = await evalRequest<{ token: string }>("/tokens", "POST", {
        orgId,
        name: String(data.get("name")),
        scopes: scope === "ci" ? ["runs:write", "runs:read"] : [scope],
        expiresAt: new Date(Date.now() + Number(data.get("days")) * 86_400_000).toISOString(),
      });
      setSecret({ label: t("apiToken"), value: result.token });
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      setDialog("");
    } finally {
      setBusy(false);
    }
  }
  async function createEndpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const type: DestinationType = integrationsV2 ? destinationType : "webhook";
    setBusy(true);
    setError("");
    try {
      const events = type === "webhook" && !integrationsV2 ? ALL_EVENTS : String(data.get("events")) === "all" ? ALL_EVENTS : ALERT_EVENTS;
      const body = !integrationsV2
        ? { orgId, label: String(data.get("label")), url: String(data.get("url")), events }
        : type === "email"
          ? { orgId, type, label: String(data.get("label")), email: String(data.get("email")), events, locale: String(data.get("locale")) }
          : type === "webhook"
            ? { orgId, type, label: String(data.get("label")), url: String(data.get("url")), events }
            : { orgId, type, label: String(data.get("label")), url: String(data.get("url")), events, locale: String(data.get("locale")) };
      const result = await evalRequest<{ secret?: string }>("/webhooks", "POST", body);
      await refresh();
      if (result.secret) setSecret({ label: t("signingSecret"), value: result.secret });
      else {
        setDialog("");
        notify(t("destinationAdded"));
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  async function rotate(item: Endpoint) {
    setBusy(true);
    setError("");
    try {
      const result = await evalRequest<{ secret: string }>(`/webhooks/${item.id}`, "PATCH", { orgId, rotate: true });
      setSecret({ label: t("signingSecret"), value: result.secret });
      setDialog("webhook");
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  async function sendTest(item: Endpoint) {
    setBusy(true);
    setError("");
    try {
      const result = await evalRequest<Pick<Endpoint, "last_test_status" | "last_test_reason" | "last_test_http_status">>(`/webhooks/${item.id}/test`, "POST", { orgId });
      await refresh();
      if (result.last_test_status === "delivered") notify(t("testSent"));
      else setError(tv("testFailed", { reason: testReason(result) }));
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  async function saveGate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gateFor) return;
    const threshold = parseThreshold(gateValue);
    if (threshold === undefined) {
      setError(t("gateThresholdHint"));
      return;
    }
    if (await mutate(() => evalRequest(`/gates/${gateFor.suite_id}`, "PUT", { orgId, threshold }), t("gateThresholdSaved"))) setGateFor(null);
  }
  function close() {
    setDialog("");
    setSecret(null);
  }
  function openEndpointDialog() {
    setError("");
    setDestinationType("slack");
    setDialog("webhook");
  }

  const days = ci ? [1, 7, 30, 90] : [30, 90, 365];
  const endpointType = (item: Endpoint): DestinationType => item.destination_type ?? "webhook";
  return (
    <>
      {error && !dialog && <Status error>{error}</Status>}
      <section>
        <div className="p-section-head">
          <div className="p-head-text">
            <h2>{t("apiTokens")}</h2>
            <p>{integrationsV2 ? t("apiTokensHelpCi") : t("apiTokensHelp")}</p>
          </div>
          {canManage && (
            <Action variant="secondary" onClick={() => { setTokenScope(integrationsV2 ? "ci" : "runs:read"); setDialog("token"); }}>
              <Plus aria-hidden="true" />
              {t("createToken")}
            </Action>
          )}
        </div>
        {tokens === null ? (
          <p className="p-cell-meta">{t("loading")}</p>
        ) : tokens.length ? (
          <DataTable caption={t("apiTokens")} headers={[t("name"), t("scope"), t("expires"), { label: t("actions"), align: "end", hidden: true }]}>
            {tokens.map((item) => (
              <tr key={item.id}>
                <RowTitle>{item.name}</RowTitle>
                <td>
                  <span className="p-api-codes">
                    {item.scopes.map((scope) => (
                      <code key={scope} className="p-code">{scope}</code>
                    ))}
                  </span>
                </td>
                <td className="p-cell-meta">{item.revoked_at ? <Badge>{t("stateRevoked")}</Badge> : <Time value={item.expires_at} withTime={false} />}</td>
                <td className="p-table-action">
                  {!item.revoked_at && canManage && (
                    <Action variant="ghost" size="sm" disabled={busy} onClick={() => void mutate(() => evalRequest(`/tokens/${item.id}`, "DELETE", { orgId }), t("tokenRevoked"))}>
                      {t("revoke")}
                    </Action>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title={t("noTokens")} icon={<KeyRound />}>
            <p>{t("noTokensHelp")}</p>
          </EmptyState>
        )}
      </section>

      <section className="p-section" data-testid="destinations">
        <div className="p-section-head">
          <div className="p-head-text">
            <h2>{integrationsV2 ? t("destinations") : t("webhooks")}</h2>
            <p>{integrationsV2 ? t("destinationsHelp") : t("webhooksHelp")}</p>
          </div>
          {canManage && (
            <Action variant="secondary" onClick={openEndpointDialog}>
              <Plus aria-hidden="true" />
              {integrationsV2 ? t("addDestination") : t("addWebhook")}
            </Action>
          )}
        </div>
        {endpoints === null ? (
          <p className="p-cell-meta">{t("loading")}</p>
        ) : endpoints.length ? (
          <DataTable caption={integrationsV2 ? t("destinations") : t("webhooks")} headers={[t("name"), t("statusLabel"), { label: t("actions"), align: "end", hidden: true }]}>
            {endpoints.map((item) => {
              const type = endpointType(item);
              return (
                <tr key={item.id}>
                  <RowTitle meta={<span className="p-break">{integrationsV2 && <><Badge>{t(DESTINATION_LABEL[type])}</Badge>{" "}</>}{item.url ?? item.target_hint}</span>}>{item.label}</RowTitle>
                  <td>
                    <StatusBadge value={item.enabled ? "enabled" : "disabled"} />
                    {item.failed_deliveries > 0 && <span className="p-cell-meta p-cell-note">{item.failed_deliveries} {t("failedDeliveries")}</span>}
                    {item.last_test_at && (
                      <span className="p-cell-meta p-cell-note" data-testid="destination-test">
                        {item.last_test_status === "delivered" ? <>{t("lastTestDelivered")} · <Time value={item.last_test_at} /></> : tv("lastTestFailed", { reason: testReason(item) })}
                      </span>
                    )}
                  </td>
                  <td className="p-table-action">
                    {canManage && (
                      <ActionMenu
                        label={t("actions")}
                        items={[
                          ...(integrationsV2 && type !== "webhook" && item.enabled ? [{ label: t("sendTest"), onSelect: () => void sendTest(item) }] : []),
                          { label: item.enabled ? t("disable") : t("enable"), onSelect: () => void mutate(() => evalRequest(`/webhooks/${item.id}`, "PATCH", { orgId, enabled: !item.enabled }), t("webhookUpdated")) },
                          ...(type === "webhook" ? [{ label: t("rotateSecret"), onSelect: () => void rotate(item) }] : []),
                          ...(integrationsV2 ? [{ label: t("destinationDelete"), onSelect: () => setDeleteFor(item) }] : []),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title={integrationsV2 ? t("noDestinations") : t("noWebhooks")} icon={<Webhook />}>
            <p>{integrationsV2 ? t("noDestinationsHelp") : t("noWebhooksHelp")}</p>
          </EmptyState>
        )}
      </section>

      {integrationsV2 && (
        <section className="p-section" data-testid="release-gate">
          <div className="p-section-head">
            <div className="p-head-text">
              <h2>{t("releaseGate")}</h2>
              <p>{t("releaseGateHelp")}</p>
            </div>
          </div>
          {gates === null ? (
            <p className="p-cell-meta">{t("loading")}</p>
          ) : gates.length ? (
            <DataTable caption={t("releaseGate")} headers={[t("evaluation"), t("gateThreshold"), { label: t("actions"), align: "end", hidden: true }]}>
              {gates.map((item) => (
                <tr key={item.evaluation_id}>
                  <RowTitle meta={
                    <span className="p-gate-ids">
                      <span>{item.suite_title}</span>
                      <span>{t("gateTestSetVersion")}: <code className="p-code">{item.suite_version_id}</code></span>
                      {item.target_revision_id && <span>{t("gateSystemVersion")}: <code className="p-code">{item.target_revision_id}</code></span>}
                    </span>
                  }>{item.evaluation_title}</RowTitle>
                  <td data-testid="gate-threshold">{item.gate_threshold === null ? <span className="p-cell-meta">{t("gateThresholdNone")}</span> : tv("gateThresholdValue", { n: percentLabel(item.gate_threshold) })}</td>
                  <td className="p-table-action">
                    {canManage && (
                      <Action variant="ghost" size="sm" disabled={busy} onClick={() => { setError(""); setGateFor(item); setGateValue(item.gate_threshold === null ? "" : String(item.gate_threshold)); }}>
                        {t("gateThresholdSet")}
                      </Action>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title={t("noGates")} icon={<CalendarClock />}>
              <p>{t("noGatesHelp")}</p>
            </EmptyState>
          )}
        </section>
      )}

      <Modal
        open={dialog === "token"}
        onOpenChange={(value) => !value && close()}
        title={secret ? t("tokenCreated") : t("createToken")}
        description={secret ? t("secretShownOnce") : t("createTokenHelp")}
        alert={error && dialog === "token" ? <Status error>{error}</Status> : undefined}
        footer={
          secret ? (
            <Action onClick={close}>{t("done")}</Action>
          ) : (
            <>
              <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
              <Action type="submit" form="token-form" disabled={busy}>{t("createToken")}</Action>
            </>
          )
        }
      >
        {secret ? (
          <CopyField label={secret.label} value={secret.value} />
        ) : (
          <form id="token-form" className="p-stack" onSubmit={createToken}>
            <Field id="token-name" name="name" label={t("name")} required maxLength={120} placeholder={t("tokenNamePlaceholder")} />
            <SelectField id="token-scope" name="scope" label={t("scope")} value={tokenScope} onChange={(event) => setTokenScope(event.target.value)}>
              {integrationsV2 && <option value="ci">{t("tokenScopeCi")}</option>}
              <option value="runs:read">{t("scopeRuns")}</option>
              <option value="reports:read">{t("scopeReports")}</option>
              <option value="schedules:read">{t("scopeSchedules")}</option>
            </SelectField>
            <SelectField key={ci ? "ci" : "read"} id="token-days" name="days" label={t("expiresIn")} defaultValue={ci ? "30" : "30"}>
              {days.map((n) => (
                <option key={n} value={n}>{n === 1 ? t("expiresOneDay") : tv("expiresDays", { n })}</option>
              ))}
            </SelectField>
            {ci && <Status tone="warn">{t("tokenWriteHint")}</Status>}
          </form>
        )}
      </Modal>

      <Modal
        open={dialog === "webhook"}
        onOpenChange={(value) => !value && close()}
        title={secret ? t("webhookSecretTitle") : integrationsV2 ? t("addDestination") : t("addWebhook")}
        description={secret ? t("secretShownOnce") : integrationsV2 ? t("addDestinationHelp") : t("addWebhookHelp")}
        alert={error && dialog === "webhook" && !secret ? <Status error>{error}</Status> : undefined}
        footer={
          secret ? (
            <Action onClick={close}>{t("done")}</Action>
          ) : (
            <>
              <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
              <Action type="submit" form="webhook-form" disabled={busy}>{integrationsV2 ? t("addDestination") : t("addWebhook")}</Action>
            </>
          )
        }
      >
        {secret ? (
          <CopyField label={secret.label} value={secret.value} />
        ) : !integrationsV2 ? (
          <form id="webhook-form" className="p-stack" onSubmit={createEndpoint}>
            <Field id="webhook-name" name="label" label={t("name")} required maxLength={120} placeholder={t("webhookNamePlaceholder")} />
            <Field id="webhook-url" name="url" type="url" label={t("httpsUrl")} required placeholder="https://hooks.example.com/caudals" />
          </form>
        ) : (
          <form id="webhook-form" className="p-stack" onSubmit={createEndpoint}>
            <SelectField id="destination-type" label={t("destinationType")} value={destinationType} onChange={(event) => setDestinationType(event.target.value as DestinationType)} hint={t(DESTINATION_HELP[destinationType])}>
              {DESTINATION_TYPES.map((type) => (
                <option key={type} value={type}>{t(DESTINATION_LABEL[type])}</option>
              ))}
            </SelectField>
            <Field id="webhook-name" name="label" label={t("name")} required maxLength={120} placeholder={destinationType === "email" ? t("destinationNameEmailPlaceholder") : destinationType === "webhook" ? t("destinationNameWebhookPlaceholder") : "#ai-quality"} />
            {destinationType === "email" ? (
              <Field key="email" id="destination-email" name="email" type="email" label={t("destinationEmailAddress")} required maxLength={254} placeholder="ai-alerts@example.com" autoComplete="off" />
            ) : (
              <Field key={destinationType} id="webhook-url" name="url" type="url" label={destinationType === "webhook" ? t("httpsUrl") : t("destinationUrl")} required maxLength={2048} autoComplete="off"
                placeholder={destinationType === "slack" ? "https://hooks.slack.com/services/…" : destinationType === "teams" ? "https://…/workflows/…" : "https://hooks.example.com/caudals"} />
            )}
            <div className="p-grid-2 p-form-grid">
              <SelectField id="destination-events" name="events" label={t("destinationEvents")} defaultValue={destinationType === "webhook" ? "all" : "alerts"} key={`events-${destinationType}`}>
                <option value="alerts">{t("destinationEventsAlerts")}</option>
                <option value="all">{t("destinationEventsAll")}</option>
              </SelectField>
              {destinationType !== "webhook" && (
                <SelectField id="destination-locale" name="locale" label={t("destinationLanguage")} defaultValue={getLocale()}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </SelectField>
              )}
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deleteFor}
        onOpenChange={(value) => !value && setDeleteFor(null)}
        title={t("destinationDeleteTitle")}
        description={t("destinationDeleteBody")}
        alert={error && deleteFor ? <Status error>{error}</Status> : undefined}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setDeleteFor(null)}>{t("cancel")}</Action>
            <Action variant="danger" disabled={busy} onClick={() => {
              const item = deleteFor;
              if (item) void mutate(() => evalRequest(`/webhooks/${item.id}`, "DELETE", { orgId }), t("destinationDeleted")).then((ok) => ok && setDeleteFor(null));
            }}>{t("destinationDelete")}</Action>
          </>
        }
      />

      <Modal
        open={!!gateFor}
        onOpenChange={(value) => !value && setGateFor(null)}
        title={t("gateThreshold")}
        description={gateFor ? `${gateFor.evaluation_title} · ${gateFor.suite_title}` : undefined}
        alert={error && gateFor ? <Status error>{error}</Status> : undefined}
        footer={
          <>
            <Action variant="secondary" onClick={() => setGateFor(null)}>{t("cancel")}</Action>
            <Action type="submit" form="gate-form" disabled={busy}>{t("save")}</Action>
          </>
        }
      >
        <form id="gate-form" onSubmit={saveGate}>
          <Field id="gate-threshold" label={t("gateThresholdField")} inputMode="decimal" value={gateValue} onChange={(event) => setGateValue(event.target.value)} hint={t("gateThresholdHint")} />
        </form>
      </Modal>
    </>
  );
}
