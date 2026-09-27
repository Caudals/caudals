"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, ListChecks, Pencil, Trash2 } from "lucide-react";
import type { CefCase } from "@/lib/evals/contracts/cases";
import { evalRequest } from "./api";
import {
  Action,
  DataTable,
  EmptyState,
  Field,
  InlineSelect,
  PageHeading,
  RowTitle,
  SearchInput,
  SectionHeading,
  Status,
  TableSkeleton,
  TextArea,
  Time,
  Toolbar,
} from "./primitives";
import { ActionMenu, Modal, notify } from "./overlays";
import { useItemActions } from "./item-actions";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace, usePageCrumb } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";

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

export function WorkspaceTestSets() {
  const router = useRouter();
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const [items, setItems] = useState<SuiteVersion[] | null>(null);
  const [projectId, setProjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [forking, setForking] = useState<SuiteVersion | null>(null);
  const [forkTitle, setForkTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!orgId) return;
    try {
      setItems(await evalRequest<SuiteVersion[]>(`/suites?orgId=${encodeURIComponent(orgId)}`));
      setError("");
    } catch (value) {
      setItems([]);
      setError(value instanceof Error ? value.message : t("error"));
    }
  }, [orgId]);
  useEffect(() => {
    setItems(null);
    void reload();
  }, [reload]);
  const actions = useItemActions(orgId, reload);

  const projects = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of items ?? []) unique.set(item.project_id, item.project_title);
    return [...unique].map(([id, title]) => ({ id, title }));
  }, [items]);
  const needle = query.trim().toLowerCase();
  const visible = (items ?? []).filter((item) => (projectId === "all" || item.project_id === projectId) && (!needle || `${item.title} ${item.project_title}`.toLowerCase().includes(needle)));

  async function createFork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!forking || !canWrite || pending || !forkTitle.trim()) return;
    setPending(true);
    setError("");
    try {
      const fork = await evalRequest<{ suiteId: string }>(`/suites/${forking.suite_id}/forks`, "POST", { orgId, suiteVersionId: forking.suite_version_id, title: forkTitle.trim() }, crypto.randomUUID());
      router.push(withOrg(`/workspace/test-sets/${fork.suiteId}`));
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      setForking(null);
    } finally {
      setPending(false);
    }
  }

  if (!workspace) return <NoWorkspace />;
  return (
    <>
      <PageHeading title={t("testSets")}>{t("testSetsHelp")}</PageHeading>
      {error && <Status error>{error}</Status>}
      {items === null ? (
        <TableSkeleton columns={4} />
      ) : !items.length ? (
        <EmptyState title={t("noTestSets")} icon={<ListChecks />}>
          <p>{t("noTestSetsCustomerHelp")}</p>
        </EmptyState>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} label={t("searchTestSets")} />
            {projects.length > 1 && (
              <InlineSelect id="test-set-project" label={t("project")} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="all">{t("allProjects")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </InlineSelect>
            )}
          </Toolbar>
          <DataTable caption={t("testSets")} headers={[t("testSet"), { label: t("tests"), align: "end" }, t("frozenAt"), { label: t("actions"), align: "end", hidden: true }]}>
            {visible.map((item) => (
              <tr key={item.suite_version_id}>
                <RowTitle meta={`${item.project_title} · ${t("revision")} ${item.content_hash.slice(0, 8)}`}>{item.title}</RowTitle>
                <td className="p-num">{item.case_count}</td>
                <td className="p-cell-meta">
                  <Time value={item.frozen_at} withTime={false} />
                </td>
                <td className="p-table-action">
                  {canWrite && (
                    <ActionMenu
                      label={`${t("moreActions")}: ${item.title}`}
                      items={[
                        { label: t("fork"), icon: <GitFork />, onSelect: () => { setForking(item); setForkTitle(`Copy of ${item.title}`.slice(0, 200)); } },
                        { label: t("rename"), icon: <Pencil />, onSelect: () => actions.rename("test-sets", item.suite_id, item.title) },
                        { separator: true },
                        { label: t("delete"), icon: <Trash2 />, tone: "danger", onSelect: () => actions.remove("test-sets", item.suite_id, item.title) },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
      {actions.dialog}
      <Modal
        open={!!forking}
        onOpenChange={(value) => !value && setForking(null)}
        title={t("forkTestSet")}
        description={t("forkTestSetHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={() => setForking(null)}>{t("cancel")}</Action>
            <Action type="submit" form="fork-form" disabled={pending || !forkTitle.trim()}>{pending ? t("working") : t("createEditableFork")}</Action>
          </>
        }
      >
        <form id="fork-form" onSubmit={createFork}>
          <Field id="fork-title" label={t("nameForCopy")} value={forkTitle} maxLength={200} required onChange={(event) => setForkTitle(event.target.value)} />
        </form>
      </Modal>
    </>
  );
}

export function WorkspaceTestSetEditor({ suiteId }: { suiteId: string }) {
  const router = useRouter();
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const [draft, setDraft] = useState<DraftDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  usePageCrumb(draft?.suiteTitle);

  const reload = useCallback(async () => {
    if (!orgId || !canWrite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDraft(await evalRequest<DraftDetails>(`/suites/${suiteId}/cases?orgId=${encodeURIComponent(orgId)}`));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [canWrite, orgId, suiteId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function freeze() {
    if (!draft || pending || !canWrite) return;
    setPending(true);
    setError("");
    try {
      await evalRequest(`/suites/${suiteId}/versions`, "POST", { orgId, version: draft.version }, crypto.randomUUID());
      notify(t("testSetFrozen"));
      router.push(withOrg("/workspace/test-sets"));
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  if (!workspace) return <NoWorkspace />;
  if (!canWrite)
    return (
      <>
        <PageHeading title={t("editableTestSet")} />
        <EmptyState title={t("editorAccessRequired")}>
          <p>{t("editorAccessRequiredHelp")}</p>
        </EmptyState>
      </>
    );

  return (
    <>
      <PageHeading
        title={draft?.suiteTitle ?? t("editableTestSet")}
        actions={draft && <Action onClick={() => void freeze()} disabled={pending}>{pending ? t("freezing") : t("freezeTestSet")}</Action>}
      >
        {t("editableTestSetHelp")}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      {loading ? (
        <p className="p-loading" role="status">
          <span className="p-spinner" aria-hidden="true" />
          {t("loading")}
        </p>
      ) : draft ? (
        <>
          <Status tone="warn">{t("editedCasesUnreviewed")}</Status>
          <ol className="p-case-editors">
            {draft.cases.map((item, index) => (
              <TestSetCaseEditor key={item.caseRevisionId} index={index + 1} orgId={orgId} suiteId={suiteId} item={item} onSaved={async () => { notify(t("caseSaved")); await reload(); }} />
            ))}
          </ol>
        </>
      ) : (
        <EmptyState title={t("forkNotAvailable")}>
          <p>{t("forkNotAvailableHelp")}</p>
        </EmptyState>
      )}
    </>
  );
}

function TestSetCaseEditor({ index, orgId, suiteId, item, onSaved }: { index: number; orgId: string; suiteId: string; item: DraftCase; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(item.document.title);
  const [contents, setContents] = useState(item.document.scenario.messages.map((message) => message.content));
  const originalExpected = item.document.reference.expected;
  const [expected, setExpected] = useState(typeof originalExpected === "string" ? originalExpected : JSON.stringify(originalExpected, null, 2));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    title !== item.document.title ||
    contents.some((content, i) => content !== item.document.scenario.messages[i].content) ||
    expected !== (typeof originalExpected === "string" ? originalExpected : JSON.stringify(originalExpected, null, 2));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    let value: unknown = expected;
    if (typeof originalExpected !== "string") {
      try {
        value = JSON.parse(expected);
      } catch {
        setError(t("invalidJsonAnswer"));
        return;
      }
    }
    setPending(true);
    setError("");
    try {
      await evalRequest(`/suites/${suiteId}/cases/${item.caseRevisionId}`, "POST", { orgId, title: title.trim(), contents, expected: value }, crypto.randomUUID());
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="p-case-editor">
      <SectionHeading title={`${index}. ${title || t("untitledCase")}`} />
      <form className="p-stack" onSubmit={(event) => void save(event)}>
        <Field id={`case-title-${item.caseRevisionId}`} label={t("caseTitle")} value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
        {contents.map((content, messageIndex) => (
          <TextArea
            key={`${item.caseRevisionId}-message-${messageIndex}`}
            id={`case-message-${item.caseRevisionId}-${messageIndex}`}
            label={`${item.document.scenario.messages[messageIndex].role === "user" ? t("userMessage") : t("assistantMessage")} ${contents.length > 1 ? messageIndex + 1 : ""}`.trim()}
            value={content}
            rows={3}
            onChange={(event) => setContents((current) => current.map((text, itemIndex) => (itemIndex === messageIndex ? event.target.value : text)))}
          />
        ))}
        <TextArea id={`case-expected-${item.caseRevisionId}`} label={t("referenceAnswer")} hint={typeof originalExpected === "string" ? undefined : t("referenceAnswerJson")} value={expected} rows={4} onChange={(event) => setExpected(event.target.value)} />
        {error && <Status error>{error}</Status>}
        <div className="p-row">
          <Action type="submit" variant="secondary" disabled={pending || !dirty}>
            {pending ? t("saving") : t("saveCase")}
          </Action>
        </div>
      </form>
    </li>
  );
}
