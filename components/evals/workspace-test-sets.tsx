"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, GitFork, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import type { CefCase } from "@/lib/evals/contracts/cases";
import { evalRequest } from "./api";
import {
  Action,
  Badge,
  DataTable,
  EmptyState,
  Field,
  InlineSelect,
  SelectField,
  PageHeading,
  RowTitle,
  SearchInput,
  SectionHeading,
  Status,
  StatusBadge,
  TableSkeleton,
  TextArea,
  Time,
  Toolbar,
  formatDate,
  humanize,
} from "./primitives";
import { ActionMenu, Modal, notify } from "./overlays";
import { DeleteDialog, useItemActions } from "./item-actions";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace, usePageCrumb } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";

type TestSetRow = {
  suite_id: string;
  title: string;
  project_id: string;
  project_title: string;
  created_at: string;
  latest_version_id: string | null;
  frozen_at: string | null;
  case_count: number;
  has_draft: boolean;
  version_count: number;
  used_by: number;
};
type CaseView = DraftCase & { excerpts: Array<{ sourceRevisionId: string; sourceTitle: string; anchor: string; excerpt: string }> };
type TestSetView = {
  suite: { id: string; title: string; projectId: string; createdAt: string };
  draft: { version: number; caseCount: number } | null;
  versions: Array<{ id: string; content_hash: string; created_at: string; case_count: number }>;
  usedBy: Array<{ id: string; title: string }>;
  selected: string;
  cases: CaseView[];
};
type DraftCase = { caseRevisionId: string; document: CefCase };
type DraftDetails = { suiteId: string; suiteTitle: string; version: number; cases: DraftCase[] };

export function WorkspaceTestSets() {
  const router = useRouter();
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const [items, setItems] = useState<TestSetRow[] | null>(null);
  const [projectId, setProjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [forking, setForking] = useState<{ suite_id: string; version_id: string; title: string } | null>(null);
  const [forkTitle, setForkTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!orgId) return;
    try {
      setItems(await evalRequest<TestSetRow[]>(`/suites?orgId=${encodeURIComponent(orgId)}&grouped=1`));
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
      const fork = await evalRequest<{ suiteId: string }>(`/suites/${forking.suite_id}/forks`, "POST", { orgId, suiteVersionId: forking.version_id, title: forkTitle.trim() }, crypto.randomUUID());
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
          <DataTable caption={t("testSets")} headers={[t("testSet"), { label: t("tests"), align: "end" }, t("statusLabel"), t("frozenAt"), { label: t("actions"), align: "end", hidden: true }]}>
            {visible.map((item) => (
              <tr key={item.suite_id}>
                <RowTitle href={withOrg(`/workspace/test-sets/${item.suite_id}`)} meta={[item.project_title, item.used_by ? `${item.used_by} ${item.used_by === 1 ? t("evaluationLower") : t("evaluationsLower")}` : null].filter(Boolean).join(" · ")}>{item.title}</RowTitle>
                <td className="p-num">{item.case_count}</td>
                <td>
                  {item.has_draft ? <Badge tone="warn" dot>{t("draftEditable")}</Badge> : <Badge tone="pass" dot>{t("frozenLabel")}</Badge>}
                </td>
                <td className="p-cell-meta">
                  {item.frozen_at ? <Time value={item.frozen_at} withTime={false} /> : "—"}
                </td>
                <td className="p-table-action">
                  {canWrite && (
                    <ActionMenu
                      label={`${t("moreActions")}: ${item.title}`}
                      items={[
                        { label: t("viewTestSet"), icon: <Eye />, href: withOrg(`/workspace/test-sets/${item.suite_id}`) },
                        ...(item.latest_version_id
                          ? [{ label: t("fork"), icon: <GitFork />, onSelect: () => { setForking({ suite_id: item.suite_id, version_id: item.latest_version_id!, title: item.title }); setForkTitle(`Copy of ${item.title}`.slice(0, 200)); } }]
                          : []),
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

/**
 * One test set: read every question with its expected answer and the source
 * excerpt it cites, switch between frozen versions, and edit the draft
 * (change, add or remove questions, then freeze a new version). A frozen
 * version is never changed; "Make an editable copy" starts a new draft.
 */
export function WorkspaceTestSetEditor({ suiteId }: { suiteId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from");
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const [view, setView] = useState<TestSetView | null>(null);
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CaseView | null>(null);
  const [forking, setForking] = useState(false);
  const [forkTitle, setForkTitle] = useState("");
  usePageCrumb(view?.suite.title);

  const reload = useCallback(async () => {
    if (!orgId) return;
    try {
      setView(await evalRequest<TestSetView>(`/suites/${suiteId}/view?orgId=${encodeURIComponent(orgId)}${version ? `&version=${version}` : ""}`));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [orgId, suiteId, version]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const lifecycle = useItemActions(orgId, async () => {
    if (lifecycleMode.current === "delete") router.push(withOrg("/workspace/test-sets"));
    else await reload();
  });
  const lifecycleMode = useRef<"rename" | "delete">("rename");

  const isDraft = view?.selected === "draft" && !!view.draft;
  const editable = canWrite && isDraft;

  async function freeze() {
    if (!view?.draft || pending) return;
    setPending(true);
    setError("");
    try {
      await evalRequest(`/suites/${suiteId}/versions`, "POST", { orgId, version: view.draft.version }, crypto.randomUUID());
      notify(t("testSetFrozen"));
      setVersion(undefined);
      if (from) router.push(withOrg(`/workspace/evaluations/${from}`));
      else await reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function createCopy(event: React.FormEvent) {
    event.preventDefault();
    if (!view || pending) return;
    const source = view.selected === "draft" ? view.versions[0]?.id : view.selected;
    if (!source) return;
    setPending(true);
    try {
      const fork = await evalRequest<{ suiteId: string }>(`/suites/${suiteId}/forks`, "POST", { orgId, suiteVersionId: source, title: forkTitle.trim() }, crypto.randomUUID());
      setForking(false);
      router.push(withOrg(`/workspace/test-sets/${fork.suiteId}`));
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
      setForking(false);
    } finally {
      setPending(false);
    }
  }
  async function removeCase(item: CaseView) {
    await evalRequest(`/suites/${suiteId}/cases/${item.caseRevisionId}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
    await reload();
  }

  if (!workspace) return <NoWorkspace />;
  if (loading)
    return (
      <p className="p-loading" role="status">
        <span className="p-spinner" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  if (!view)
    return (
      <>
        <PageHeading title={t("testSet")} />
        {error && <Status error>{error}</Status>}
      </>
    );

  const versionOptions = [
    ...(view.draft ? [{ value: "draft", label: `${t("draftEditable")} · ${view.draft.caseCount} ${t("tests").toLowerCase()}` }] : []),
    ...view.versions.map((item, index) => ({ value: item.id, label: `${index === 0 ? t("latestVersion") : t("version")} · ${formatDate(item.created_at)} · ${item.case_count} ${t("tests").toLowerCase()}` })),
  ];

  return (
    <>
      <PageHeading
        title={view.suite.title}
        meta={
          <>
            {isDraft ? <Badge tone="warn" dot>{t("draftEditable")}</Badge> : <Badge tone="pass" dot>{t("frozenLabel")}</Badge>}
            <span>{view.cases.length} {t("tests").toLowerCase()}</span>
            {view.usedBy.length > 0 && (
              <span>
                {t("usedBy")} {view.usedBy.map((item) => item.title).join(", ")}
              </span>
            )}
          </>
        }
        actions={
          canWrite && (
            <>
              {isDraft ? (
                <Action onClick={() => void freeze()} disabled={pending || !view.cases.length}>
                  {pending ? t("freezing") : from ? t("freezeAndReturn") : t("freezeTestSet")}
                </Action>
              ) : (
                view.versions.length > 0 && (
                  <Action variant="secondary" onClick={() => { setForkTitle(`${view.suite.title} (edited)`.slice(0, 200)); setForking(true); }}>
                    <Pencil aria-hidden="true" />
                    {t("makeEditableCopy")}
                  </Action>
                )
              )}
              <ActionMenu
                label={t("moreActions")}
                items={[
                  { label: t("rename"), icon: <Pencil />, onSelect: () => { lifecycleMode.current = "rename"; lifecycle.rename("test-sets", suiteId, view.suite.title); } },
                  { separator: true },
                  { label: t("delete"), icon: <Trash2 />, tone: "danger", onSelect: () => { lifecycleMode.current = "delete"; lifecycle.remove("test-sets", suiteId, view.suite.title); } },
                ]}
              />
            </>
          )
        }
      >
        {isDraft ? t("draftTestSetHelp") : t("frozenTestSetHelp")}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      {versionOptions.length > 1 && (
        <Toolbar>
          <InlineSelect id="test-set-version" label={t("version")} value={view.selected} onChange={(event) => { setEditing(null); setVersion(event.target.value); }}>
            {versionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </InlineSelect>
        </Toolbar>
      )}
      {isDraft && <Status tone="warn">{t("editedCasesUnreviewed")}</Status>}
      {view.cases.length ? (
        <ol className="p-cases">
          {view.cases.map((item, index) =>
            editing === item.caseRevisionId && editable ? (
              <TestSetCaseEditor
                key={item.caseRevisionId}
                index={index + 1}
                orgId={orgId}
                suiteId={suiteId}
                item={item}
                onCancel={() => setEditing(null)}
                onSaved={async () => {
                  notify(t("caseSaved"));
                  setEditing(null);
                  await reload();
                }}
              />
            ) : (
              <CaseCard
                key={item.caseRevisionId}
                index={index + 1}
                item={item}
                actions={
                  editable ? (
                    <span className="p-row p-nowrap">
                      <Action variant="ghost" size="sm" onClick={() => setEditing(item.caseRevisionId)}>
                        <Pencil aria-hidden="true" />
                        {t("edit")}
                      </Action>
                      <Action variant="ghost" size="sm" onClick={() => setRemoving(item)} disabled={view.cases.length <= 1}>
                        <Trash2 aria-hidden="true" />
                        {t("remove")}
                      </Action>
                    </span>
                  ) : null
                }
              />
            ),
          )}
        </ol>
      ) : (
        <EmptyState title={t("noTestsInSet")} icon={<ListChecks />} />
      )}
      {editable && (
        <div className="p-row" style={{ marginTop: 16 }}>
          <Action variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t("addQuestion")}
          </Action>
        </div>
      )}
      {adding && <AddCaseDialog orgId={orgId} suiteId={suiteId} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); notify(t("questionAdded")); await reload(); }} />}
      {removing && (
        <DeleteDialog kind="cases" name={removing.document.title} onClose={() => setRemoving(null)} onConfirm={() => removeCase(removing)} />
      )}
      {lifecycle.dialog}
      <Modal
        open={forking}
        onOpenChange={setForking}
        title={t("makeEditableCopy")}
        description={t("forkTestSetHelp")}
        footer={
          <>
            <Action variant="secondary" onClick={() => setForking(false)}>{t("cancel")}</Action>
            <Action type="submit" form="copy-form" disabled={pending || !forkTitle.trim()}>{pending ? t("working") : t("createEditableFork")}</Action>
          </>
        }
      >
        <form id="copy-form" onSubmit={createCopy}>
          <Field id="copy-title" label={t("nameForCopy")} value={forkTitle} maxLength={200} required onChange={(event) => setForkTitle(event.target.value)} />
        </form>
      </Modal>
    </>
  );
}

function expectedText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function CaseCard({ index, item, actions }: { index: number; item: CaseView; actions: React.ReactNode }) {
  const document = item.document;
  return (
    <li className="p-case">
      <span className="p-case-index">{index}</span>
      <div className="p-case-body">
        <div className="p-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <span className="p-row">
            <strong>{document.title}</strong>
            <StatusBadge value={document.severity} />
            {document.provenance.evidence_level === "customer_supplied_unreviewed" && <Badge>{t("editedLabel")}</Badge>}
          </span>
          {actions}
        </div>
        {document.scenario.messages.map((message, messageIndex) => (
          <p key={messageIndex} className="p-case-question" style={{ whiteSpace: "pre-wrap" }}>
            {document.scenario.messages.length > 1 && <span className="p-cell-meta">{message.role === "user" ? t("userMessage") : t("assistantMessage")}: </span>}
            {message.content}
          </p>
        ))}
        <dl className="p-case-facts">
          <div>
            <dt>{t("expectedAnswer")}</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{expectedText(document.reference.expected)}</dd>
          </div>
          <div>
            <dt>{t("sourceExcerpt")}</dt>
            <dd>
              {item.excerpts.length ? (
                item.excerpts.map((excerpt) => (
                  <details key={`${excerpt.sourceRevisionId}-${excerpt.anchor}`}>
                    <summary className="p-cell-meta">{excerpt.sourceTitle}</summary>
                    <blockquote className="p-quote" style={{ whiteSpace: "pre-wrap" }}>{excerpt.excerpt}</blockquote>
                  </details>
                ))
              ) : (
                <span className="p-cell-meta">{t("sourceExcerptMissing")}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function AddCaseDialog({ orgId, suiteId, onClose, onSaved }: { orgId: string; suiteId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await evalRequest(`/suites/${suiteId}/cases`, "POST", { orgId, title: (title.trim() || question.trim()).slice(0, 200), question: question.trim(), expected: expected.trim(), severity }, key.current);
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("addQuestion")}
      description={t("addQuestionHelp")}
      alert={error ? <Status error>{error}</Status> : null}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="add-case" disabled={pending || !question.trim() || !expected.trim()}>{pending ? t("saving") : t("addQuestion")}</Action>
        </>
      }
    >
      <form id="add-case" className="p-stack" onSubmit={save}>
        <TextArea id="add-case-question" label={t("question")} value={question} rows={3} required onChange={(event) => setQuestion(event.target.value)} />
        <TextArea id="add-case-expected" label={t("referenceAnswer")} value={expected} rows={3} required onChange={(event) => setExpected(event.target.value)} />
        <Field id="add-case-title" label={t("caseTitleOptional")} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        <SelectField id="add-case-severity" label={t("severity")} value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
          {(["low", "medium", "high", "critical"] as const).map((value) => (
            <option key={value} value={value}>{humanize(value)}</option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}

function TestSetCaseEditor({ index, orgId, suiteId, item, onSaved, onCancel }: { index: number; orgId: string; suiteId: string; item: DraftCase; onSaved: () => Promise<void>; onCancel?: () => void }) {
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
    <li className="p-case-editor" style={{ margin: "12px 0" }}>
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
          {onCancel && (
            <Action variant="ghost" onClick={onCancel} disabled={pending}>
              {t("cancel")}
            </Action>
          )}
        </div>
      </form>
    </li>
  );
}
