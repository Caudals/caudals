"use client";

import { useState } from "react";
import { FileText, Inbox } from "lucide-react";
import { Action, DataTable, EmptyState, PageHeading, RowTitle, SearchInput, Status, StatusBadge, TableSkeleton, Time, Toolbar } from "./primitives";
import { Meter, percent } from "./charts";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace } from "./workspace-context";
import { useWorkspaceSummary } from "./workspace-data";
import { t } from "@/lib/evals/messages/en";

export function WorkspaceReports() {
  const { orgId, workspace, withOrg } = useWorkspace();
  const { summary, error, retry, loading } = useWorkspaceSummary(orgId);
  const [query, setQuery] = useState("");
  if (!workspace) return <NoWorkspace />;
  const needle = query.trim().toLowerCase();
  const reports = (summary?.reports ?? []).filter((item) => !needle || `${item.title} ${item.system_name ?? ""}`.toLowerCase().includes(needle));
  const evaluationTitle = (id: string) => summary?.evaluations.find((item) => item.id === id)?.title;

  return (
    <>
      <PageHeading title={t("reports")} />
      {error && (
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>
          {error}
        </Status>
      )}
      {!summary ? (
        loading ? <TableSkeleton columns={4} /> : null
      ) : !summary.reports.length ? (
        <EmptyState title={t("noReports")} icon={<FileText />}>
          <p>{t("noReportsHelp")}</p>
        </EmptyState>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} label={t("searchReports")} />
          </Toolbar>
          {reports.length ? (
            <DataTable caption={t("reports")} headers={[t("report"), t("strictPassRate"), t("statusLabel"), { label: t("published"), align: "end" }]}>
              {reports.map((report) => (
                <tr key={report.id}>
                  <RowTitle href={withOrg(`/workspace/reports/${report.id}`)} meta={[...new Set([report.system_name, evaluationTitle(report.evaluation_id)].filter(Boolean))].join(" · ") || undefined}>
                    {report.title}
                  </RowTitle>
                  <td>
                    {report.strict_pass_rate != null ? (
                      <span className="p-row p-nowrap">
                        <Meter value={report.strict_pass_rate} label={`${t("strictPassRate")} ${percent(report.strict_pass_rate)}`} />
                        <span className="p-cell-meta">
                          {report.n_pass}/{report.n_scorable}
                        </span>
                      </span>
                    ) : (
                      <span className="p-cell-meta">{t("notAvailable")}</span>
                    )}
                  </td>
                  <td>
                    <span className="p-row p-nowrap">
                      <StatusBadge value={report.review_status ?? "preliminary"} />
                      {report.headline_status === "incomplete" && <StatusBadge value="incomplete" />}
                    </span>
                  </td>
                  <td className="p-table-action p-cell-meta">
                    <Time value={report.revision_created_at ?? report.updated_at ?? null} />
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title={t("noMatchingReports")} icon={<Inbox />}>
              <p>{t("noMatchingEvaluationsHelp")}</p>
            </EmptyState>
          )}
        </>
      )}
    </>
  );
}
