"use client";

/**
 * Operator overview (spec §5.5 step 7): one work table across every client,
 * sorted by what needs doing next. Rows open the client's own evaluation page
 * (the operator acts in the customer's permitted view) or the run inspector.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, Building2, Plus } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action,
  ActionLink,
  Badge,
  DataTable,
  EmptyState,
  FilterChips,
  PageHeading,
  RowTitle,
  SearchInput,
  Stat,
  StatGrid,
  Status,
  TableSkeleton,
  Time,
  Toolbar,
} from "./primitives";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceSummary } from "./workspace-data";
import { evaluationStage, type StageKey } from "./evaluation-stage";
import { t } from "@/lib/evals/messages/en";

const NEXT_STEP: Record<StageKey, string> = {
  setup: "Waiting for reference material",
  preparing: "Preparing tests",
  needs_input: "Answer context questions",
  review_tests: "Approve the test set",
  ready: "Start the run",
  running: "Running",
  paused: "Resume or reduce scope",
  finalizing: "Score and publish the report",
  results: "Report published",
  failed: "Inspect the failure",
  canceled: "Cancelled",
};
const PRIORITY: StageKey[] = ["failed", "paused", "needs_input", "review_tests", "finalizing", "ready", "running", "preparing", "setup", "results", "canceled"];

export type ClientSummary = { id: string; name: string; summary: WorkspaceSummary | null; error: boolean; message?: string };

/** Every client's workspace summary, loaded in parallel and refreshed quietly. */
export function useClientSummaries() {
  const { workspaces } = useWorkspace();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const load = useCallback(async () => {
    const rows = await Promise.all(
      workspaces.map(async (workspace) => {
        try {
          return { id: workspace.id, name: workspace.name, summary: await evalRequest<WorkspaceSummary>(`/workspace/summary?orgId=${encodeURIComponent(workspace.id)}`), error: false };
        } catch (reason) {
          // The message is curated (5xx carries only a support reference).
          return { id: workspace.id, name: workspace.name, summary: null, error: true, message: reason instanceof Error ? reason.message : t("error") };
        }
      }),
    );
    setClients(rows);
  }, [workspaces]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);
  return { clients, reload: load };
}

type Filter = "action" | "live" | "all";

export function OperatorOverview() {
  const { clients, reload } = useClientSummaries();
  const requested = useSearchParams().get("filter");
  const [filter, setFilter] = useState<Filter>(requested === "all" || requested === "live" ? requested : "action");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      (clients ?? []).flatMap((client) =>
        (client.summary?.evaluations ?? []).map((evaluation) => {
          const report = client.summary?.reports.find((item) => item.evaluation_id === evaluation.id);
          const stage = evaluationStage(evaluation, !!report);
          return { client, evaluation, report, stage };
        }),
      ),
    [clients],
  );
  const counts = {
    action: rows.filter((row) => row.stage.needsAction || row.stage.key === "finalizing").length,
    live: rows.filter((row) => row.stage.live).length,
    all: rows.length,
  };
  const needle = query.trim().toLowerCase();
  const visible = rows
    .filter((row) => (filter === "all" ? true : filter === "live" ? row.stage.live : row.stage.needsAction || row.stage.key === "finalizing"))
    .filter((row) => !needle || `${row.evaluation.title} ${row.client.name}`.toLowerCase().includes(needle))
    .sort((a, b) => PRIORITY.indexOf(a.stage.key) - PRIORITY.indexOf(b.stage.key) || String(b.evaluation.updated_at ?? "").localeCompare(String(a.evaluation.updated_at ?? "")));
  const failedClients = (clients ?? []).filter((client) => client.error);
  const published = (clients ?? []).reduce((sum, client) => sum + (client.summary?.reports.length ?? 0), 0);

  return (
    <>
      <PageHeading
        title={t("overview")}
        actions={
          clients?.length ? (
            <ActionLink variant="secondary" href="/ops/clients">
              <Plus aria-hidden="true" />
              {t("newClient")}
            </ActionLink>
          ) : undefined
        }
      />
      {failedClients.length > 0 && (
        <Status error action={<Action variant="secondary" size="sm" onClick={() => void reload()}>{t("retry")}</Action>}>
          {t("clientsFailedToLoad")} {failedClients.map((client) => `${client.name}${client.message ? ` (${client.message})` : ""}`).join(", ")}
        </Status>
      )}
      {clients === null ? (
        <TableSkeleton columns={5} />
      ) : !clients.length ? (
        <EmptyState
          title={t("noClients")}
          icon={<Building2 />}
          action={
            <ActionLink href="/ops/clients">
              <Plus aria-hidden="true" />
              {t("newClient")}
            </ActionLink>
          }
        >
          <p>{t("noClientsBody")}</p>
        </EmptyState>
      ) : (
        <>
          <StatGrid>
            <Stat label={t("clients")} value={clients.length} />
            <Stat label={t("needsAction")} value={counts.action} />
            <Stat label={t("inProgress")} value={counts.live} />
            <Stat label={t("reportsPublished")} value={published} />
          </StatGrid>
          <div className="p-section">
            <Toolbar>
              <SearchInput value={query} onChange={setQuery} label={t("searchEvaluationsClients")} />
            </Toolbar>
            <div className="p-toolbar">
              <FilterChips
                value={filter}
                onChange={setFilter}
                label={t("filterEvaluations")}
                options={[
                  { value: "action", label: t("needsAction"), count: counts.action },
                  { value: "live", label: t("inProgress"), count: counts.live },
                  { value: "all", label: t("all"), count: counts.all },
                ]}
              />
            </div>
            {visible.length ? (
              <DataTable caption={t("workQueue")} headers={[t("evaluation"), t("statusLabel"), t("nextStep"), { label: t("updated"), align: "end" }]}>
                {visible.map(({ client, evaluation, stage }) => (
                  <tr key={`${client.id}-${evaluation.id}`}>
                    <RowTitle href={`/workspace/evaluations/${evaluation.id}?orgId=${client.id}`} meta={client.name}>
                      {evaluation.title}
                    </RowTitle>
                    <td>
                      <Badge tone={stage.tone} dot live={stage.live}>
                        {stage.label}
                      </Badge>
                    </td>
                    <td className="p-cell-meta">
                      {NEXT_STEP[stage.key]}
                      {evaluation.latest_run_id && (
                        <>
                          {" · "}
                          <Link className="p-link" href={`/ops/runs/${evaluation.latest_run_id}?orgId=${client.id}`}>
                            {t("inspectRun")}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="p-table-action p-cell-meta">
                      <Time value={evaluation.updated_at ?? null} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <EmptyState
                title={!rows.length ? t("noClientEvaluations") : filter === "action" ? t("nothingNeedsAction") : t("noMatchingEvaluations")}
                icon={<Activity />}
              >
                <p>{!rows.length ? t("noClientEvaluationsHelp") : filter === "action" ? t("nothingNeedsActionHelp") : t("noMatchingEvaluationsHelp")}</p>
              </EmptyState>
            )}
          </div>
        </>
      )}
    </>
  );
}
