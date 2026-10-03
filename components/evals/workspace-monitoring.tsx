"use client";

/**
 * Repeatable service (spec WP-13): scheduled reruns of an approved test set,
 * their outcomes, and the customer's own integrations — scoped read-only API
 * tokens and signed webhooks. Secrets are shown exactly once.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, KeyRound, Plus, Webhook } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, EmptyState, Field, RowTitle, SectionHeading, SelectField, Status, StatusBadge, Time } from "./primitives";
import { ActionMenu, CopyField, Modal, notify } from "./overlays";
import type { WorkspaceSummary } from "./workspace-data";
import { t } from "@/lib/evals/messages/en";

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
};
type Alert = { id: string; schedule_id: string; candidate_run_id: string; status: string; reason_codes: string[]; created_at: string };
type Endpoint = { id: string; label: string; url: string; events: string[]; enabled: boolean; failed_deliveries: number };
type Token = { id: string; name: string; scopes: string[]; expires_at: string; revoked_at: string | null };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function MonitoringSchedules({ orgId, canManage, summary }: { orgId: string; canManage: boolean; summary: WorkspaceSummary }) {
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

  const eligible = summary.evaluations.filter((item) => item.preparation_status === "ready" && item.selected_suite_version_id);
  const evaluation = eligible.find((item) => item.id === evaluationId) ?? eligible[0];
  const systems = summary.systems.filter((item) => (evaluation?.selected_target_id ? item.id === evaluation.selected_target_id : item.project_id === evaluation?.project_id) && item.document.kind !== "imported_responses");
  const selectedTarget = systems.find((item) => item.target_revision_id === targetRevisionId) ?? systems[0];
  const current = useMemo(() => new Map(summary.evaluations.map((item) => [item.id, item])), [summary.evaluations]);

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
            cadence,
            localTime,
            weekday: cadence === "weekly" ? weekday : null,
            dayOfMonth: cadence === "monthly" ? dayOfMonth : null,
            maxRunSpend: maxRunSpend || String(Number(evaluation.commercial_cap)),
            currency: evaluation.currency,
            sourceMaxAgeDays: sourceMaxAgeDays ? Number(sourceMaxAgeDays) : null,
          },
          crypto.randomUUID(),
        ),
      t("scheduleCreated"),
    );
    if (ok) setOpen(false);
  }

  const canCreate = summary.entitlement.can_schedule && !!evaluation && !!selectedTarget;
  return (
    <section>
      <div className="p-section-head">
        <div className="p-head-text">
          <h2>{t("scheduledRuns")}</h2>
          <p>{t("scheduledRunsHelp")}</p>
        </div>
        {canManage && (
          <Action variant="secondary" onClick={() => setOpen(true)} disabled={!canCreate}>
            <Plus aria-hidden="true" />
            {t("newSchedule")}
          </Action>
        )}
      </div>
      {!summary.entitlement.can_schedule && <Status>{t("schedulingDisabled")}</Status>}
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
                  {item.cadence[0].toUpperCase() + item.cadence.slice(1)} · {String(item.local_time).slice(0, 5)}
                  <span className="p-cell-meta p-cell-note">{item.timezone}</span>
                </td>
                <td className="p-cell-meta">
                  <Time value={item.next_due_at} />
                </td>
                <td>
                  <StatusBadge value={item.status} />
                  {(item.reason_code || item.latest_dispatch_reason) && <span className="p-cell-meta p-cell-note">{(item.reason_code ?? item.latest_dispatch_reason ?? "").replaceAll("_", " ")}</span>}
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
          <DataTable caption={t("monitoringOutcomes")} headers={[t("when"), t("outcome"), t("reason")]}>
            {alerts.map((item) => (
              <tr key={item.id}>
                <RowTitle>
                  <Time value={item.created_at} />
                </RowTitle>
                <td>
                  <StatusBadge value={item.status} />
                </td>
                <td className="p-cell-meta">{item.reason_codes.map((code) => code.replaceAll("_", " ")).join(", ") || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("newSchedule")}
        description={t("newScheduleHelp")}
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
            <SelectField id="monitor-cadence" label={t("cadence")} value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)}>
              <option value="daily">{t("daily")}</option>
              <option value="weekly">{t("weekly")}</option>
              <option value="monthly">{t("monthly")}</option>
            </SelectField>
            {cadence === "weekly" && (
              <SelectField id="monitor-weekday" label={t("weekday")} value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index + 1}>{day}</option>
                ))}
              </SelectField>
            )}
            {cadence === "monthly" && <Field id="monitor-day" label={t("dayOfMonth")} type="number" min={1} max={31} value={dayOfMonth} onChange={(event) => setDayOfMonth(Number(event.target.value))} required />}
            <Field id="monitor-time" label={t("localTime")} type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} required />
            <Field id="monitor-zone" label={t("timezone")} value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
            <Field id="monitor-spend" label={`${t("maxRunSpend")} (${evaluation?.currency ?? summary.entitlement.currency})`} inputMode="decimal" value={maxRunSpend || (evaluation?.commercial_cap ? String(Number(evaluation.commercial_cap)) : "")} onChange={(event) => setMaxRunSpend(event.target.value)} required />
            <Field id="monitor-freshness" label={t("maxSourceAge")} type="number" min={1} max={3650} value={sourceMaxAgeDays} onChange={(event) => setSourceMaxAgeDays(event.target.value)} hint={t("optional")} />
          </div>
          <p className="p-field-hint">{t("scheduleSlotHelp")}</p>
        </form>
      </Modal>
    </section>
  );
}

export function DeveloperAccess({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"" | "token" | "webhook">("");
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);

  const refresh = useCallback(async () => {
    const [e, k] = await Promise.all([evalRequest<Endpoint[]>(`/webhooks?orgId=${encodeURIComponent(orgId)}`), evalRequest<Token[]>(`/tokens?orgId=${encodeURIComponent(orgId)}`)]);
    setEndpoints(e);
    setTokens(k);
  }, [orgId]);
  useEffect(() => {
    void refresh().catch((value) => {
      setEndpoints([]);
      setTokens([]);
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
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
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
      const result = await evalRequest<{ token: string }>("/tokens", "POST", {
        orgId,
        name: String(data.get("name")),
        scopes: [String(data.get("scope"))],
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
    setBusy(true);
    setError("");
    try {
      const result = await evalRequest<{ secret: string }>("/webhooks", "POST", {
        orgId,
        label: String(data.get("label")),
        url: String(data.get("url")),
        events: ["run_completed", "run_partial", "run_unknown", "regression", "inconclusive"],
      });
      setSecret({ label: t("signingSecret"), value: result.secret });
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      setDialog("");
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
  function close() {
    setDialog("");
    setSecret(null);
  }

  return (
    <>
      {error && <Status error>{error}</Status>}
      <section>
        <div className="p-section-head">
          <div className="p-head-text">
            <h2>{t("apiTokens")}</h2>
            <p>{t("apiTokensHelp")}</p>
          </div>
          {canManage && (
            <Action variant="secondary" onClick={() => setDialog("token")}>
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
                  {item.scopes.map((scope) => (
                    <code key={scope} className="p-code">{scope}</code>
                  ))}
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

      <section className="p-section">
        <div className="p-section-head">
          <div className="p-head-text">
            <h2>{t("webhooks")}</h2>
            <p>{t("webhooksHelp")}</p>
          </div>
          {canManage && (
            <Action variant="secondary" onClick={() => setDialog("webhook")}>
              <Plus aria-hidden="true" />
              {t("addWebhook")}
            </Action>
          )}
        </div>
        {endpoints === null ? (
          <p className="p-cell-meta">{t("loading")}</p>
        ) : endpoints.length ? (
          <DataTable caption={t("webhooks")} headers={[t("name"), t("statusLabel"), { label: t("actions"), align: "end", hidden: true }]}>
            {endpoints.map((item) => (
              <tr key={item.id}>
                <RowTitle meta={item.url}>{item.label}</RowTitle>
                <td>
                  <StatusBadge value={item.enabled ? "enabled" : "disabled"} />
                  {item.failed_deliveries > 0 && <span className="p-cell-meta p-cell-note">{item.failed_deliveries} {t("failedDeliveries")}</span>}
                </td>
                <td className="p-table-action">
                  {canManage && (
                    <ActionMenu
                      label={t("actions")}
                      items={[
                        { label: item.enabled ? t("disable") : t("enable"), onSelect: () => void mutate(() => evalRequest(`/webhooks/${item.id}`, "PATCH", { orgId, enabled: !item.enabled }), t("webhookUpdated")) },
                        { label: t("rotateSecret"), onSelect: () => void rotate(item) },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title={t("noWebhooks")} icon={<Webhook />}>
            <p>{t("noWebhooksHelp")}</p>
          </EmptyState>
        )}
      </section>

      <Modal
        open={dialog === "token"}
        onOpenChange={(value) => !value && close()}
        title={secret ? t("tokenCreated") : t("createToken")}
        description={secret ? t("secretShownOnce") : t("createTokenHelp")}
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
            <Field id="token-name" name="name" label={t("name")} required maxLength={120} placeholder="CI pipeline" />
            <SelectField id="token-scope" name="scope" label={t("scope")}>
              <option value="runs:read">{t("scopeRuns")}</option>
              <option value="reports:read">{t("scopeReports")}</option>
              <option value="schedules:read">{t("scopeSchedules")}</option>
            </SelectField>
            <SelectField id="token-days" name="days" label={t("expiresIn")}>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">365 days</option>
            </SelectField>
          </form>
        )}
      </Modal>

      <Modal
        open={dialog === "webhook"}
        onOpenChange={(value) => !value && close()}
        title={secret ? t("webhookSecretTitle") : t("addWebhook")}
        description={secret ? t("secretShownOnce") : t("addWebhookHelp")}
        footer={
          secret ? (
            <Action onClick={close}>{t("done")}</Action>
          ) : (
            <>
              <Action variant="secondary" onClick={close}>{t("cancel")}</Action>
              <Action type="submit" form="webhook-form" disabled={busy}>{t("addWebhook")}</Action>
            </>
          )
        }
      >
        {secret ? (
          <CopyField label={secret.label} value={secret.value} />
        ) : (
          <form id="webhook-form" className="p-stack" onSubmit={createEndpoint}>
            <Field id="webhook-name" name="label" label={t("name")} required maxLength={120} placeholder="Slack relay" />
            <Field id="webhook-url" name="url" type="url" label={t("httpsUrl")} required placeholder="https://hooks.example.com/caudals" />
          </form>
        )}
      </Modal>
    </>
  );
}
