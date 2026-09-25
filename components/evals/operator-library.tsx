"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { evalRequest } from "./api";
import { Badge, DataTable, EmptyState, Loading, PageHeading, RowTitle, SectionHeading, StatusBadge } from "./primitives";
import { Boxes, FileStack, ListChecks } from "lucide-react";
import { t } from "@/lib/evals/messages/en";
import type { DomainPack } from "@/lib/evals/generation/pack-registry";

export type LibrarySection = "test-sets" | "sources" | "domain-packs";
type Workspace = { id: string; name: string };

/** Operator Library (spec §5.1): frozen test sets, reference material and domain packs across clients. */
export function OperatorLibrary({ section }: { section: LibrarySection }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [orgId, setOrgId] = useState("");
  useEffect(() => { if (section !== "domain-packs") void evalRequest<Workspace[]>("/workspaces").then((rows) => { setWorkspaces(rows); setOrgId((current) => current || rows[0]?.id || ""); }).catch(() => undefined); }, [section]);
  const title = section === "test-sets" ? "Test sets" : section === "sources" ? "Sources" : "Domain packs";
  return <>
    <PageHeading title={title}>{section === "test-sets" ? t("libraryTestSetsHelp") : section === "sources" ? t("librarySourcesHelp") : t("libraryPacksHelp")}</PageHeading>
    {section !== "domain-packs" && <div className="eval-toolbar"><label htmlFor="library-workspace">{t("workspace")}</label>
      <select id="library-workspace" value={orgId} onChange={(event) => setOrgId(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    {section === "test-sets" ? <TestSets key={orgId} orgId={orgId} /> : section === "sources" ? <Sources key={orgId} orgId={orgId} /> : <Packs />}
  </>;
}

function TestSets({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<Array<{ suite_id: string; suite_version_id: string; project_title: string; title: string; content_hash: string; frozen_at: string; case_count: number }> | null>(null);
  useEffect(() => { if (orgId) { void evalRequest<NonNullable<typeof rows>>(`/suites?orgId=${orgId}`).then(setRows).catch(() => setRows([])); } }, [orgId]);
  if (!rows) return <Loading />;
  if (!rows.length) return <EmptyState title={t("noTestSets")} icon={<ListChecks />}><p>{t("noTestSetsHelp")}</p></EmptyState>;
  return <DataTable caption="Test sets" headers={[t("testSet"), t("tests"), t("frozenAt"), { label: t("access"), align: "end" }]}>
    {rows.map((row) => <tr key={row.suite_version_id}><RowTitle meta={`${row.project_title} · ${row.content_hash.slice(0, 12)}`}>{row.title}</RowTitle><td>{row.case_count}</td>
      <td className="p-cell-meta">{new Date(row.frozen_at).toLocaleString()}</td>
      <td className="p-table-action"><Link className="p-link" href={`/workspace/test-sets?orgId=${orgId}`}>{t("open")}</Link></td></tr>)}
  </DataTable>;
}

function Sources({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; title: string; rights: string; created_at: string; project_title: string; revisions: number; extraction_version: string | null; anchors: number | null; ingestion_status: string | null }> | null>(null);
  useEffect(() => { if (orgId) { void evalRequest<NonNullable<typeof rows>>(`/sources?orgId=${orgId}`).then(setRows).catch(() => setRows([])); } }, [orgId]);
  if (!rows) return <Loading />;
  if (!rows.length) return <EmptyState title={t("noSources")} icon={<FileStack />}><p>{t("noSourcesHelp")}</p></EmptyState>;
  return <DataTable caption="Sources" headers={[t("source"), t("rights"), t("revisionsLabel"), t("anchorsLabel"), t("statusLabel")]}>
    {rows.map((row) => <tr key={row.id}><RowTitle meta={`${row.project_title} · ${new Date(row.created_at).toLocaleDateString()}${row.extraction_version ? ` · ${row.extraction_version}` : ""}`}>{row.title}</RowTitle>
      <td><Badge>{row.rights.replaceAll("_", " ")}</Badge></td><td>{row.revisions}</td><td>{row.anchors ?? "—"}</td>
      <td><StatusBadge value={row.ingestion_status ?? (row.revisions ? "completed" : "pending")} /></td></tr>)}
  </DataTable>;
}

function Packs() {
  const [packs, setPacks] = useState<DomainPack[] | null>(null);
  useEffect(() => { void evalRequest<DomainPack[]>("/domain-packs").then(setPacks).catch(() => setPacks([])); }, []);
  if (!packs) return <Loading />;
  if (!packs.length) return <EmptyState title={t("noPacks")} icon={<Boxes />}><p>{t("noPacksHelp")}</p></EmptyState>;
  return <>{packs.map((pack) => <article className="eval-panel" key={pack.id}>
    <p className="p-row" style={{ gap: 6 }}><Badge tone={pack.status === "active" ? "pass" : "neutral"}>{pack.status}</Badge><code className="p-code">{pack.id}@{pack.version}</code></p>
    <h2>{pack.title}</h2><p>{pack.summary}</p>
    <SectionHeading title={t("packTasks")} /><p>{pack.taskTypes.join(", ")}</p>
    <SectionHeading title={t("packContext")} /><ul>{pack.requiredContext.map((item) => <li key={item}>{item}</li>)}</ul>
    <SectionHeading title={t("packSources")} /><ul>{pack.sourceHierarchy.map((item) => <li key={item}>{item}</li>)}</ul>
    <SectionHeading title={t("packRubric")} /><ul>{pack.rubricCriteria.map((item) => <li key={item.id}><code className="p-code">{item.id}</code> {item.description}</li>)}</ul>
    <SectionHeading title={t("packEvaluators")} /><p>{pack.deterministicEvaluators.join(" · ")}</p>
    <SectionHeading title={t("packProhibited")} /><ul>{pack.prohibitedAssumptions.map((item) => <li key={item}>{item}</li>)}</ul>
    <p className="p-cell-meta">{pack.reviewGuidelines}</p>
  </article>)}</>;
}
