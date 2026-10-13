"use client";

/**
 * Operator run inspector (spec WP-08): frozen plan, stage timeline, per-case
 * outcomes with attempt identity, rubric-judge progress and the separate
 * reserved / settled / unresolved costs. Read-only diagnostics.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { evalRequest } from "./api";
import { Action, DataTable, DefinitionList, FilterChips, PageHeading, RowTitle, SectionHeading, Stat, StatGrid, Status, StatusBadge, Time, formatMoney, humanize } from "./primitives";
import { OutcomeBar } from "./charts";
import { RunJudgments } from "./run-judgments";
import { usePageCrumb } from "./workspace-context";
import { t, tv } from "@/lib/evals/messages/en";

type RunData = {
  run: { status: string; phase: string; created_at?: string; execution_mode?: string; reason_code?: string | null };
  plan: { content_hash: string; document: Record<string, unknown> };
  units: Array<{ id: string; status: string; case_revision_id: string; attempt_id?: string; reason_code?: string }>;
  events: Array<{ id: number; kind: string; reason_code?: string; created_at: string }>;
  costs: { reserved: string; settled: string; unresolved: string };
  targetUsage: { calls: number; unknown: number };
};

export function RunInspector({ runId }: { runId: string }) {
  const orgId = useSearchParams().get("orgId") ?? "";
  const [data, setData] = useState<RunData | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  usePageCrumb(`${t("run")} ${runId.slice(0, 8)}`);
  const load = useCallback(() => {
    if (!orgId) {
      setError(t("runNeedsClient"));
      return;
    }
    void evalRequest<RunData>(`/runs/${runId}?orgId=${encodeURIComponent(orgId)}`)
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((value) => setError(value instanceof Error ? value.message : t("error")));
  }, [orgId, runId]);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const statuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit of data?.units ?? []) counts.set(unit.status, (counts.get(unit.status) ?? 0) + 1);
    return [...counts.entries()];
  }, [data]);
  const units = (data?.units ?? []).filter((unit) => filter === "all" || unit.status === filter);
  const answered = data?.units.filter((unit) => unit.status === "succeeded").length ?? 0;
  const errored = data?.units.filter((unit) => !["succeeded", "pending", "canceled"].includes(unit.status)).length ?? 0;
  const pending = data?.units.filter((unit) => unit.status === "pending").length ?? 0;

  return (
    <>
      <PageHeading
        title={`${t("run")} ${runId.slice(0, 8)}`}
        meta={
          data && (
            <>
              <StatusBadge value={data.run.status} />
              {!["completed", "partial", "failed", "canceled"].includes(data.run.status) && <StatusBadge value={data.run.phase} />}
              {data.run.execution_mode && <span>{humanize(data.run.execution_mode)}</span>}
              {data.run.created_at && (
                <span>
                  {t("started")} <Time value={data.run.created_at} />
                </span>
              )}
            </>
          )
        }
        actions={
          <Action variant="secondary" onClick={load}>
            <RefreshCw aria-hidden="true" />
            {t("refresh")}
          </Action>
        }
      >
        {t("runInspectorHelp")}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      {data && (
        <>
          {data.run.reason_code && <Status tone="warn">{humanize(data.run.reason_code)}</Status>}
          <StatGrid>
            <Stat label={t("tests")} value={data.units.length} meta={`${answered} ${t("answeredLower")} · ${pending} ${t("pendingLower")}`} />
            <Stat label={t("settledCost")} value={formatMoney(data.costs.settled)} meta={`${t("reserved")} ${formatMoney(data.costs.reserved)}`} />
            <Stat label={t("unresolvedCost")} value={formatMoney(data.costs.unresolved)} meta={t("unresolvedCostHelp")} />
            <Stat label={t("externalTargetCalls")} value={data.targetUsage.calls} meta={`${data.targetUsage.unknown} ${t("unknownOutcome")}`} />
          </StatGrid>
          <div className="p-section">
            <OutcomeBar counts={{ pass: answered, partial: 0, fail: errored, unscorable: pending }} label={t("executionOutcomes")} labels={{ pass: t("answeredLabel"), partial: null, fail: t("errorsLabel"), unscorable: t("pendingLabel") }} />
            <p className="p-field-hint">{t("executionOutcomesHelp")}</p>
          </div>

          <section className="p-section">
            <SectionHeading title={t("caseUnits")} />
            {statuses.length > 1 && (
              <div className="p-toolbar">
                <FilterChips
                  value={filter}
                  onChange={setFilter}
                  label={t("filterStatus")}
                  options={[{ value: "all", label: t("all"), count: data.units.length }, ...statuses.map(([status, count]) => ({ value: status, label: humanize(status), count }))]}
                />
              </div>
            )}
            <DataTable caption={t("caseUnits")} headers={[t("caseRevision"), t("statusLabel"), { label: t("attempt"), align: "end" }]}>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <RowTitle meta={unit.reason_code ? humanize(unit.reason_code) : undefined}>
                    <code className="p-code">{unit.case_revision_id.slice(0, 12)}</code>
                  </RowTitle>
                  <td>
                    <StatusBadge value={unit.status} />
                  </td>
                  <td className="p-table-action">
                    <code className="p-code">{unit.attempt_id ? unit.attempt_id.slice(0, 12) : "—"}</code>
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <RunCredits orgId={orgId} runId={runId} />

          <RunJudgments orgId={orgId} runId={runId} />

          <div className="p-split p-section">
            <section>
              <SectionHeading title={t("timeline")} />
              <ol className="p-timeline">
                {data.events.map((event) => (
                  <li key={event.id}>
                    <span className="p-timeline-dot" aria-hidden="true" />
                    <span className="p-timeline-text">{humanize(event.kind)}</span>
                    <span className="p-cell-meta">
                      {event.reason_code ? `${humanize(event.reason_code)} · ` : ""}
                      <Time value={event.created_at} />
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <SectionHeading title={t("frozenPlan")}>{t("frozenPlanHelp")}</SectionHeading>
              <DefinitionList
                items={[
                  { term: t("planHash"), value: <code className="p-code">{data.plan.content_hash.slice(0, 24)}…</code> },
                  ...Object.entries(data.plan.document)
                    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
                    .slice(0, 12)
                    .map(([key, value]) => ({ term: humanize(key), value: <span className="p-mono-cell">{String(value)}</span> })),
                ]}
              />
            </section>
          </div>
        </>
      )}
    </>
  );
}

type RunCreditData = {
  priceBookRevisionId: string | null;
  attempts: Array<{ attemptId: string; role: string; status: string; reservedEur: string | null; settledEur: string | null; reservation: string | null; held: string | null; charged: string | null; holdState: string | null; shadow: boolean }>;
  meters: Array<{ meter: string; count: number; credits: string; shadow: boolean }>;
  totals: { engineCredits: string; meterCredits: string; refundedCredits: string; chargedEur: string; settledEur: string };
};

/** Credits charged next to our cost for each engine attempt (launch L-16, spec §5.3); shadow amounts while the shadow week runs. */
function RunCredits({ orgId, runId }: { orgId: string; runId: string }) {
  const [data, setData] = useState<RunCreditData | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void evalRequest<RunCreditData>(`/billing/admin/runs/${runId}?orgId=${encodeURIComponent(orgId)}`).then(setData).catch(() => setData(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orgId, runId]);
  if (!data || (!data.attempts.length && !data.meters.length)) return null;
  const shadow = data.attempts.some((row) => row.shadow) || data.meters.some((row) => row.shadow);
  return (
    <section className="p-section">
      <SectionHeading title={t("runCreditsTitle")}>{shadow ? t("runCreditsShadowHelp") : t("runCreditsHelp")}</SectionHeading>
      <StatGrid>
        <Stat label={t("runCreditsCharged")} value={formatMoney(Number(data.totals.engineCredits) + Number(data.totals.meterCredits))}
          meta={tv("runCreditsSplit", { engine: formatMoney(data.totals.engineCredits), meters: formatMoney(data.totals.meterCredits) })} />
        <Stat label={t("runCreditsRevenue")} value={`${formatMoney(data.totals.chargedEur)} €`} meta={Number(data.totals.refundedCredits) ? tv("runCreditsRefunded", { credits: formatMoney(data.totals.refundedCredits) }) : undefined} />
        <Stat label={t("runCreditsOurCost")} value={`${formatMoney(data.totals.settledEur)} €`} meta={t("runCreditsOurCostHelp")} />
      </StatGrid>
      {data.attempts.length > 0 && (
        <DataTable caption={t("runCreditsTitle")} headers={[t("attempt"), t("statusLabel"), { label: t("runCreditsCostColumn"), align: "end" }, { label: t("runCreditsHeldColumn"), align: "end" }, { label: t("runCreditsChargedColumn"), align: "end" }]}>
          {data.attempts.map((row) => (
            <tr key={row.attemptId}>
              <RowTitle meta={humanize(row.role)}><code className="p-code">{row.attemptId.slice(0, 12)}</code></RowTitle>
              <td><StatusBadge value={row.status} /></td>
              <td className="p-num">{row.settledEur !== null ? `${formatMoney(row.settledEur)} €` : row.reservedEur !== null ? `${formatMoney(row.reservedEur)} € (${humanize(row.reservation ?? "reserved")})` : "—"}</td>
              <td className="p-num">{row.held !== null ? formatMoney(row.held) : "—"}</td>
              <td className="p-num">{row.charged !== null ? formatMoney(row.charged) : "—"}{row.shadow ? <span className="p-cell-meta p-cell-note">{t("runCreditsShadow")}</span> : null}</td>
            </tr>
          ))}
        </DataTable>
      )}
      {data.meters.length > 0 && (
        <p className="p-field-hint">{data.meters.map((row) => `${humanize(row.meter)}: ${row.count} · ${formatMoney(row.credits)}${row.shadow ? ` (${t("runCreditsShadow")})` : ""}`).join(" · ")}</p>
      )}
    </section>
  );
}
