"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Boxes, FileStack, ListChecks } from "lucide-react";
import { evalRequest } from "./api";
import { Badge, DataTable, DefinitionList, EmptyState, PageHeading, RowTitle, SearchInput, StatusBadge, TabLinks, TableSkeleton, Time, Toolbar, humanize } from "./primitives";
import { SidePanel } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";
import type { DomainPack } from "@/lib/evals/generation/pack-registry";

export type LibrarySection = "test-sets" | "sources" | "domain-packs" | "improvements";

/**
 * Operator Library (spec §5.1): frozen test sets, reference material, domain
 * packs and improvement datasets. Client-scoped tabs follow the workspace
 * switcher; domain packs are platform-wide.
 */
export function LibraryFrame({ section, improvements, children }: { section: LibrarySection; improvements: boolean; children: ReactNode }) {
  const { workspace } = useWorkspace();
  return (
    <>
      <PageHeading
        title={t("library")}
        meta={section !== "domain-packs" && workspace ? <span>{t("clientContext")} <strong>{workspace.name}</strong></span> : undefined}
      />
      <TabLinks
        label={t("library")}
        current={section}
        options={[
          { id: "test-sets", href: "/ops/library/test-sets", label: t("testSets") },
          { id: "sources", href: "/ops/library/sources", label: t("sources") },
          { id: "domain-packs", href: "/ops/library/domain-packs", label: t("domainPacks") },
          ...(improvements ? [{ id: "improvements", href: "/ops/improvements", label: t("improvementDatasets") }] : []),
        ]}
      />
      {children}
    </>
  );
}

export function OperatorLibrary({ section, improvements }: { section: Exclude<LibrarySection, "improvements">; improvements: boolean }) {
  const { orgId } = useWorkspace();
  return (
    <LibraryFrame section={section} improvements={improvements}>
      {section === "test-sets" ? <TestSets key={orgId} orgId={orgId} /> : section === "sources" ? <Sources key={orgId} orgId={orgId} /> : <Packs />}
    </LibraryFrame>
  );
}

function TestSets({ orgId }: { orgId: string }) {
  const { withOrg } = useWorkspace();
  const [rows, setRows] = useState<Array<{ suite_id: string; suite_version_id: string; project_title: string; title: string; content_hash: string; frozen_at: string; case_count: number }> | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (orgId) void evalRequest<NonNullable<typeof rows>>(`/suites?orgId=${orgId}`).then(setRows).catch(() => setRows([]));
  }, [orgId]);
  if (!rows) return <TableSkeleton columns={4} />;
  if (!rows.length)
    return (
      <EmptyState title={t("noTestSets")} icon={<ListChecks />}>
        <p>{t("noTestSetsHelp")}</p>
      </EmptyState>
    );
  const needle = query.trim().toLowerCase();
  return (
    <>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} label={t("searchTestSets")} />
      </Toolbar>
      <DataTable caption={t("testSets")} headers={[t("testSet"), { label: t("tests"), align: "end" }, t("frozenAt"), { label: t("hash"), align: "end" }]}>
        {rows
          .filter((row) => !needle || `${row.title} ${row.project_title}`.toLowerCase().includes(needle))
          .map((row) => (
            <tr key={row.suite_version_id}>
              <RowTitle href={withOrg("/workspace/test-sets")} meta={row.project_title}>
                {row.title}
              </RowTitle>
              <td className="p-num">{row.case_count}</td>
              <td className="p-cell-meta">
                <Time value={row.frozen_at} withTime={false} />
              </td>
              <td className="p-table-action">
                <code className="p-code">{row.content_hash.slice(0, 12)}</code>
              </td>
            </tr>
          ))}
      </DataTable>
    </>
  );
}

function Sources({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; title: string; rights: string; created_at: string; project_title: string; revisions: number; extraction_version: string | null; anchors: number | null; ingestion_status: string | null }> | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (orgId) void evalRequest<NonNullable<typeof rows>>(`/sources?orgId=${orgId}`).then(setRows).catch(() => setRows([]));
  }, [orgId]);
  if (!rows) return <TableSkeleton columns={5} />;
  if (!rows.length)
    return (
      <EmptyState title={t("noSources")} icon={<FileStack />}>
        <p>{t("noSourcesHelp")}</p>
      </EmptyState>
    );
  const needle = query.trim().toLowerCase();
  return (
    <>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} label={t("searchSources")} />
      </Toolbar>
      <DataTable caption={t("sources")} headers={[t("source"), t("rights"), { label: t("revisionsLabel"), align: "end" }, { label: t("anchorsLabel"), align: "end" }, { label: t("statusLabel"), align: "end" }]}>
        {rows
          .filter((row) => !needle || `${row.title} ${row.project_title}`.toLowerCase().includes(needle))
          .map((row) => (
            <tr key={row.id}>
              <RowTitle meta={<>{row.project_title} · <Time value={row.created_at} withTime={false} />{row.extraction_version ? ` · ${row.extraction_version}` : ""}</>}>{row.title}</RowTitle>
              <td>
                <Badge>{humanize(row.rights)}</Badge>
              </td>
              <td className="p-num">{row.revisions}</td>
              <td className="p-num">{row.anchors ?? "—"}</td>
              <td className="p-table-action">
                <StatusBadge value={row.ingestion_status ?? (row.revisions ? "completed" : "pending")} />
              </td>
            </tr>
          ))}
      </DataTable>
    </>
  );
}

function Packs() {
  const [packs, setPacks] = useState<DomainPack[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    void evalRequest<DomainPack[]>("/domain-packs").then(setPacks).catch(() => setPacks([]));
  }, []);
  if (!packs) return <TableSkeleton columns={3} />;
  if (!packs.length)
    return (
      <EmptyState title={t("noPacks")} icon={<Boxes />}>
        <p>{t("noPacksHelp")}</p>
      </EmptyState>
    );
  const pack = packs.find((item) => `${item.id}@${item.version}` === openId) ?? null;
  return (
    <>
      <DataTable caption={t("domainPacks")} headers={[t("domainPack"), t("taskTypes"), { label: t("statusLabel"), align: "end" }]}>
        {packs.map((item) => (
          <tr key={`${item.id}@${item.version}`}>
            <th scope="row">
              <span className="p-table-primary">
                <button type="button" className="p-row-link p-row-button" onClick={() => setOpenId(`${item.id}@${item.version}`)}>
                  {item.title}
                </button>
                <span className="p-cell-meta">{item.summary}</span>
              </span>
            </th>
            <td className="p-cell-meta">{item.taskTypes.map(humanize).join(", ")}</td>
            <td className="p-table-action">
              <StatusBadge value={item.status} />
            </td>
          </tr>
        ))}
      </DataTable>
      <SidePanel open={!!pack} onOpenChange={(value) => !value && setOpenId(null)} title={pack?.title ?? t("domainPack")} description={pack && <code className="p-code">{pack.id}@{pack.version}</code>} wide>
        {pack && (
          <>
            <p>{pack.summary}</p>
            <DefinitionList
              items={[
                { term: t("packTasks"), value: pack.taskTypes.map(humanize).join(", ") },
                { term: t("packEvaluators"), value: pack.deterministicEvaluators.join(", ") || "—" },
              ]}
            />
            <PackList title={t("packContext")} items={pack.requiredContext} />
            <PackList title={t("packSources")} items={pack.sourceHierarchy} />
            <PackList title={t("packRubric")} items={pack.rubricCriteria.map((item) => `${item.id} — ${item.description}`)} />
            <PackList title={t("packProhibited")} items={pack.prohibitedAssumptions} />
            <p className="p-cell-meta">{pack.reviewGuidelines}</p>
          </>
        )}
      </SidePanel>
    </>
  );
}

function PackList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="p-subhead">{title}</h3>
      <ul className="p-bullets">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
