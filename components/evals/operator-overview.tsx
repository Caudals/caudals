"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, FileText, SlidersHorizontal } from "lucide-react";
import { t } from "@/lib/evals/messages/en";
import { evalRequest } from "./api";
import {
  Action,
  Badge,
  DataTable,
  EmptyState,
  InlineSelect,
  Loading,
  PageHeading,
  RowTitle,
  Status,
  StatusBadge,
} from "./primitives";

type Workspace = { id: string; name: string };
type Managed = {
  evaluations: Array<{
    id: string;
    title: string;
    preparation_status: string;
    project_title: string;
  }>;
  runs: Array<{
    id: string;
    evaluation_title: string;
    status: string;
    phase: string;
    updated_at: string;
  }>;
  reports: Array<{
    id: string;
    title: string;
    publication_status: string;
  }>;
};

export function OperatorOverview() {
  return <QueueView kind="overview" />;
}

export function QueueView({
  kind,
}: {
  kind: "overview" | "review" | "reports" | "platform";
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<Managed | null>(null);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");

  const loadWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true);
    setError("");
    try {
      const items = await evalRequest<Workspace[]>("/workspaces");
      setWorkspaces(items);
      setSelected((current) =>
        items.some((item) => item.id === current) ? current : (items[0]?.id ?? ""),
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setWorkspacesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const loadData = useCallback(async () => {
    if (kind === "platform" || !selected) {
      setData(null);
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setError("");
    try {
      setData(
        await evalRequest<Managed>(
          `/evaluations?orgId=${encodeURIComponent(selected)}`,
        ),
      );
    } catch (value) {
      setData(null);
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setDataLoading(false);
    }
  }, [kind, selected]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const title =
    kind === "review"
      ? t("reviewQueue")
      : kind === "reports"
        ? t("reports")
        : kind === "platform"
          ? t("platform")
          : t("operatorOverview");

  return (
    <>
      <PageHeading title={title}>
        {kind === "platform" ? t("platformHelp") : t("operatorOverviewHelp")}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      <div className="eval-toolbar">
        <InlineSelect
          id="ops-client"
          label={t("selectedClient")}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t("chooseWorkspace")}</option>
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </InlineSelect>
      </div>
      {kind === "platform" ? (
        <div className="eval-panel">
          <h2>{t("providersBudgets")}</h2>
          <p>{t("providerSecurityHelp")}</p>
        </div>
      ) : workspacesLoading || dataLoading ? (
        <Loading />
      ) : error ? (
        <Action variant="secondary" onClick={() => void (selected ? loadData() : loadWorkspaces())}>
          {t("retry")}
        </Action>
      ) : !workspaces.length ? (
        <EmptyState title={t("noClients")}>
          <p>{t("noClientsBody")}</p>
        </EmptyState>
      ) : !selected || !data ? (
        <EmptyState title={t("chooseWorkspace")}>
          <p>{t("operatorOverviewHelp")}</p>
        </EmptyState>
      ) : kind === "reports" ? (
        data.reports.length ? (
          <DataTable caption={t("reports")} headers={[t("report"), t("statusLabel")]}>
            {data.reports.map((item) => (
              <tr key={item.id}>
                <RowTitle>{item.title}</RowTitle>
                <td><StatusBadge value={item.publication_status} /></td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title={t("noReports")} icon={<FileText />}>
            <p>{t("operatorOverviewHelp")}</p>
          </EmptyState>
        )
      ) : kind === "review" ? (
        (() => {
          const queue = data.evaluations.filter((item) =>
            ["needs_review", "validating"].includes(item.preparation_status),
          );
          return queue.length ? (
            <DataTable caption={t("reviewQueue")} headers={[t("evaluation"), t("statusLabel")]}>
              {queue.map((item) => (
                <tr key={item.id}>
                  <RowTitle meta={item.project_title}>{item.title}</RowTitle>
                  <td><StatusBadge value={item.preparation_status} /></td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title={t("reviewQueue")} icon={<SlidersHorizontal />}>
              <p>{t("operatorOverviewHelp")}</p>
            </EmptyState>
          );
        })()
      ) : data.runs.length ? (
        <DataTable
          caption={t("activeRuns")}
          headers={[t("evaluation"), t("statusLabel"), t("phase"), { label: t("access"), align: "end" }]}
        >
          {data.runs.map((item) => (
            <tr key={item.id}>
              <RowTitle>{item.evaluation_title}</RowTitle>
              <td><StatusBadge value={item.status} /></td>
              <td><Badge>{item.phase.replaceAll("_", " ")}</Badge></td>
              <td className="p-table-action">
                <Link className="p-link" href={`/ops/runs/${item.id}?orgId=${selected}`}>
                  {t("inspect")}
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState title={t("noRuns")} icon={<Activity />}>
          <p>{t("noRunsHelp")}</p>
        </EmptyState>
      )}
    </>
  );
}
