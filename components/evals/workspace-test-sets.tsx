"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import type { CefCase } from "@/lib/evals/contracts/cases";
import { evalRequest } from "./api";
import { Action, ActionLink, DataTable, EmptyState, Field, Loading, PageHeading, Status, TextArea } from "./primitives";

type SuiteVersion = {
  suite_id: string;
  suite_version_id: string;
  project_id: string;
  project_title: string;
  title: string;
  content_hash: string;
  frozen_at: string;
  case_count: number;
};
type DraftCase = { caseRevisionId: string; document: CefCase };
type DraftDetails = { suiteId: string; suiteTitle: string; version: number; cases: DraftCase[] };

function initialWorkspace(workspaces: EvalIdentity["workspaces"], requested: string | null) {
  return workspaces.find((workspace) => workspace.id === requested)?.id ?? workspaces[0]?.id ?? "";
}

export function WorkspaceTestSets({ workspaces }: { workspaces: EvalIdentity["workspaces"] }) {
  const router = useRouter();
  const requestedOrgId = useSearchParams().get("orgId");
  const [orgId, setOrgId] = useState(() => initialWorkspace(workspaces, requestedOrgId));
  const [items, setItems] = useState<SuiteVersion[]>([]);
  const [projectId, setProjectId] = useState("all");
  const [forking, setForking] = useState("");
  const [forkTitle, setForkTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const workspace = workspaces.find((item) => item.id === orgId);
  const canWrite = ["owner", "editor", "operator"].includes(workspace?.role ?? "");

  const reload = useCallback(async () => {
    if (!orgId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const query = new URLSearchParams({ orgId });
      if (projectId !== "all") query.set("projectId", projectId);
      setItems(await evalRequest<SuiteVersion[]>(`/suites?${query.toString()}`));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Test sets could not be loaded.");
    } finally { setLoading(false); }
  }, [orgId, projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const projects = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of items) unique.set(item.project_id, item.project_title);
    return [...unique].map(([id, title]) => ({ id, title }));
  }, [items]);

  async function createFork(item: SuiteVersion, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending || !forkTitle.trim()) return;
    setPending(true); setError("");
    try {
      const fork = await evalRequest<{ suiteId: string }>(
        `/suites/${item.suite_id}/forks`, "POST",
        { orgId, suiteVersionId: item.suite_version_id, title: forkTitle.trim() },
        crypto.randomUUID(),
      );
      router.push(`/workspace/test-sets/${fork.suiteId}?orgId=${encodeURIComponent(orgId)}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "The test set could not be forked.");
    } finally { setPending(false); }
  }

  return <>
    <PageHeading title="Test sets">Browse frozen test sets and make an editable copy for your workspace.</PageHeading>
    {workspace && <div className="eval-toolbar">
      <label htmlFor="test-set-workspace">Workspace</label>
      <select id="test-set-workspace" value={orgId} onChange={(event) => { setOrgId(event.target.value); setProjectId("all"); }}>
        {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <label htmlFor="test-set-project">Project</label>
      <select id="test-set-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
        <option value="all">All projects</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select>
    </div>}
    {error && <Status error>{error}</Status>}
    {loading ? <Loading /> : items.length ? <DataTable caption="Frozen test sets" headers={["Test set", "Cases", "Frozen", { label: "Actions", align: "end" }]}>
      {items.map((item) => <tr key={item.suite_version_id}>
        <th scope="row"><strong>{item.title}</strong><small className="eval-cell-meta">{item.project_title} · revision {item.content_hash.slice(0, 8)}</small></th>
        <td>{item.case_count}</td>
        <td>{new Date(item.frozen_at).toLocaleDateString()}</td>
        <td className="p-table-action">
          {canWrite ? <details>
            <summary className="p-link">Fork test set</summary>
            <form className="eval-form" onSubmit={(event) => void createFork(item, event)}>
              <Field id={`fork-title-${item.suite_version_id}`} label="Name for your copy" value={forking === item.suite_version_id ? forkTitle : `Copy of ${item.title}`}
                maxLength={200} required onFocus={() => { if (forking !== item.suite_version_id) { setForking(item.suite_version_id); setForkTitle(`Copy of ${item.title}`.slice(0, 200)); } }}
                onChange={(event) => { setForking(item.suite_version_id); setForkTitle(event.target.value); }} />
              <Action type="submit" disabled={pending || forking !== item.suite_version_id || !forkTitle.trim()}>Create editable fork</Action>
            </form>
          </details> : <span>Read only</span>}
        </td>
      </tr>)}
    </DataTable> : <EmptyState title="No frozen test sets yet">
      <p>Approved test sets will appear here. When one is available, owners and editors can create a private editable fork.</p>
      <ActionLink variant="secondary" href={`/workspace/evaluations${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ""}`}>Back to evaluations</ActionLink>
    </EmptyState>}
  </>;
}

export function WorkspaceTestSetEditor({ suiteId, workspaces }: { suiteId: string; workspaces: EvalIdentity["workspaces"] }) {
  const router = useRouter();
  const requestedOrgId = useSearchParams().get("orgId");
  const orgId = initialWorkspace(workspaces, requestedOrgId);
  const workspace = workspaces.find((item) => item.id === orgId);
  const canWrite = ["owner", "editor", "operator"].includes(workspace?.role ?? "");
  const [draft, setDraft] = useState<DraftDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!orgId || !canWrite) { setLoading(false); return; }
    setLoading(true);
    try {
      setDraft(await evalRequest<DraftDetails>(`/suites/${suiteId}/cases?orgId=${encodeURIComponent(orgId)}`));
      setError("");
    } catch (value) { setError(value instanceof Error ? value.message : "This fork could not be loaded."); }
    finally { setLoading(false); }
  }, [canWrite, orgId, suiteId]);
  useEffect(() => { void reload(); }, [reload]);

  async function freeze() {
    if (!draft || pending || !canWrite) return;
    setPending(true); setError("");
    try {
      await evalRequest(`/suites/${suiteId}/versions`, "POST", { orgId, version: draft.version }, crypto.randomUUID());
      router.push(`/workspace/test-sets?orgId=${encodeURIComponent(orgId)}`);
    } catch (value) { setError(value instanceof Error ? value.message : "The test set could not be frozen."); }
    finally { setPending(false); }
  }

  if (!canWrite) return <>
    <PageHeading title="Editable test set" />
    <EmptyState title="Owner or editor access required"><p>Ask a workspace owner to change a test-set fork.</p></EmptyState>
  </>;

  return <>
    <PageHeading title={draft?.suiteTitle ?? "Editable test set"} actions={<ActionLink variant="secondary" href={`/workspace/test-sets?orgId=${encodeURIComponent(orgId)}`}>Test sets</ActionLink>}>
      Edit your copy, review every case, then freeze it as a new immutable test-set version.
    </PageHeading>
    {notice && <Status tone="success">{notice}</Status>}
    {error && <Status error>{error}</Status>}
    {loading ? <Loading /> : draft ? <>
      <Status tone="warn">Any saved case change marks it as customer supplied and unreviewed. Its source evidence remains attached for review.</Status>
      {draft.cases.map((item) => <TestSetCaseEditor key={item.caseRevisionId} orgId={orgId} suiteId={suiteId} item={item} onSaved={async () => { setNotice("Case saved. Review it before freezing the test set."); await reload(); }} />)}
      <section className="eval-flow-card">
        <h2>Freeze this fork</h2>
        <p>Freezing creates a new immutable version. Holdout cases stay hidden from this editor and remain unchanged.</p>
        <Action disabled={pending} onClick={() => void freeze()}>{pending ? "Freezing…" : "Freeze test set"}</Action>
      </section>
    </> : <EmptyState title="Fork not available"><p>Return to the test-set library and create a new fork from a frozen version.</p></EmptyState>}
  </>;
}

function TestSetCaseEditor({ orgId, suiteId, item, onSaved }: { orgId: string; suiteId: string; item: DraftCase; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(item.document.title);
  const [contents, setContents] = useState(item.document.scenario.messages.map((message) => message.content));
  const originalExpected = item.document.reference.expected;
  const [expected, setExpected] = useState(typeof originalExpected === "string" ? originalExpected : JSON.stringify(originalExpected, null, 2));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    let value: unknown = expected;
    if (typeof originalExpected !== "string") {
      try { value = JSON.parse(expected); }
      catch { setError("Enter a valid JSON reference answer."); return; }
    }
    setPending(true); setError("");
    try {
      await evalRequest(`/suites/${suiteId}/cases/${item.caseRevisionId}`, "POST", { orgId, title: title.trim(), contents, expected: value }, crypto.randomUUID());
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Case changes could not be saved."); }
    finally { setPending(false); }
  }

  return <section className="eval-flow-card">
    <h2>{title || "Untitled case"}</h2>
    <form className="eval-form" onSubmit={(event) => void save(event)}>
      <Field id={`case-title-${item.caseRevisionId}`} label="Case title" value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
      {contents.map((content, index) => <TextArea key={`${item.caseRevisionId}-message-${index}`} id={`case-message-${item.caseRevisionId}-${index}`} label={`Scenario message ${index + 1} (${item.document.scenario.messages[index].role})`} value={content} rows={3} onChange={(event) => setContents((current) => current.map((text, itemIndex) => itemIndex === index ? event.target.value : text))} />)}
      <TextArea id={`case-expected-${item.caseRevisionId}`} label="Reference answer (JSON for structured answers)" value={expected} rows={4} onChange={(event) => setExpected(event.target.value)} />
      {error && <Status error>{error}</Status>}
      <Action type="submit" variant="secondary" disabled={pending}>{pending ? "Saving…" : "Save case"}</Action>
    </form>
  </section>;
}
