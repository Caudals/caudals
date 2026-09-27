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
import { t } from "@/lib/evals/messages/en";

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
