"use client";

/**
 * Pieces of test-set preparation: the excerpt viewer/editor for a piece of
 * reference material, the scope picker (size and difficulty), the optional
 * context questions and the review of a generated draft.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check as CheckIcon, FileText, Info, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { CefCase } from "@/lib/evals/contracts/cases";
import { evalRequest } from "./api";
import { Action, ActionLink, Badge, Chip, FilterChips, SearchInput, Status, StatusBadge } from "./primitives";
import { SidePanel, notify } from "./overlays";
import { t, tv, type MessageKey } from "@/lib/evals/messages/en";

/* ------------------------------------------------------------- excerpts --- */

/**
 * The expected answer inside its excerpt: a window around the first match,
 * cut at word boundaries, or the opening of the excerpt when there is none.
 */
export function excerptWindow(excerpt: string, answer: string, radius = 200) {
  const text = excerpt.replace(/\s+/g, " ").trim();
  const needle = answer.replace(/\s+/g, " ").trim();
  const at = needle ? text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
  if (at < 0) {
    const end = text.length > radius * 2 ? text.lastIndexOf(" ", radius * 2) : text.length;
    return { before: "", match: "", after: text.slice(0, end > 0 ? end : radius * 2), clippedStart: false, clippedEnd: end < text.length, found: false };
  }
  let start = Math.max(0, at - radius);
  let end = Math.min(text.length, at + needle.length + radius);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at + needle.length ? text.lastIndexOf(" ", end) : end;
  return {
    before: text.slice(start, at),
    match: text.slice(at, at + needle.length),
    after: text.slice(at + needle.length, end),
    clippedStart: start > 0,
    clippedEnd: end < text.length,
    found: true,
  };
}

/** A source excerpt, trimmed to the answer it supports, with the answer highlighted. */
export function ExcerptSnippet({ excerpt, answer, source }: { excerpt: string; answer: string; source?: string }) {
  const [full, setFull] = useState(false);
  const window = useMemo(() => excerptWindow(excerpt, answer), [excerpt, answer]);
  const clipped = window.clippedStart || window.clippedEnd;
  const highlight = (text: string) => {
    if (!window.found) return text;
    const at = text.toLocaleLowerCase().indexOf(window.match.toLocaleLowerCase());
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark className="p-excerpt-mark">{text.slice(at, at + window.match.length)}</mark>
        {text.slice(at + window.match.length)}
      </>
    );
  };
  return (
    <figure className="p-excerpt">
      {source && (
        <figcaption className="p-excerpt-source">
          <FileText aria-hidden="true" />
          <span>{source}</span>
        </figcaption>
      )}
      <blockquote className="p-excerpt-text" data-full={full ? "true" : undefined}>
        {full ? (
          highlight(excerpt)
        ) : (
          <>
            {window.clippedStart && "… "}
            {window.before}
            {window.found && <mark className="p-excerpt-mark">{window.match}</mark>}
            {window.after}
            {window.clippedEnd && " …"}
          </>
        )}
      </blockquote>
      {clipped && (
        <button type="button" className="p-link-button" aria-expanded={full} onClick={() => setFull((value) => !value)}>
          {full ? t("reviewShowLess") : t("reviewShowFull")}
        </button>
      )}
    </figure>
  );
}

type Chunk = { id: string; excerpt: string };
type SourceDetail = { title?: string; chunks: Chunk[]; chunkCount?: number; revisions?: Array<{ id: string }> };

/**
 * Every excerpt extracted from one document or website, with inline editing
 * and removal. Changes are staged and saved together as a new revision.
 */
export function ExcerptBrowser({
  orgId,
  source,
  open,
  readOnly = false,
  onOpenChange,
  onSaved,
}: {
  orgId: string;
  source: { id: string; title: string } | null;
  open: boolean;
  readOnly?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (update: { revisionId: string; chunks: Chunk[] }) => void;
}) {
  const [detail, setDetail] = useState<{ revisionId: string; chunks: Chunk[]; total: number } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveKey = useRef(crypto.randomUUID());

  const sourceId = source?.id;
  useEffect(() => {
    if (!open || !sourceId) return;
    let live = true;
    setDetail(null);
    setLoadError("");
    setEdits({});
    setRemoved(new Set());
    setEditing(null);
    setQuery("");
    setError("");
    void evalRequest<SourceDetail>(`/sources/${sourceId}?orgId=${encodeURIComponent(orgId)}`)
      .then((value) => {
        if (!live) return;
        const revisionId = value.revisions?.[0]?.id ?? "";
        setDetail({ revisionId, chunks: value.chunks, total: value.chunkCount ?? value.chunks.length });
      })
      .catch((value) => live && setLoadError(value instanceof Error ? value.message : t("error")));
    return () => {
      live = false;
    };
  }, [open, sourceId, orgId]);

  const changed = useMemo(
    () => (detail ? detail.chunks.filter((chunk) => edits[chunk.id] !== undefined && edits[chunk.id].trim() !== chunk.excerpt).map((chunk) => chunk.id) : []),
    [detail, edits],
  );
  const changeCount = changed.length + removed.size;
  const invalid = detail?.chunks.some((chunk) => edits[chunk.id] !== undefined && !edits[chunk.id].trim() && !removed.has(chunk.id)) ?? false;
  const visible = useMemo(() => {
    if (!detail) return [];
    const needle = query.trim().toLocaleLowerCase();
    return detail.chunks
      .map((chunk, index) => ({ chunk, index }))
      .filter(({ chunk }) => !needle || (edits[chunk.id] ?? chunk.excerpt).toLocaleLowerCase().includes(needle));
  }, [detail, edits, query]);

  function close(next: boolean) {
    if (!next && changeCount && !window.confirm(t("excerptDiscardConfirm"))) return;
    onOpenChange(next);
  }

  async function save() {
    if (!detail || !sourceId || !changeCount || invalid || saving) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        orgId,
        baseRevisionId: detail.revisionId,
        edits: changed.filter((id) => !removed.has(id)).map((id) => ({ anchorId: id, excerpt: edits[id].trim() })),
        removals: [...removed],
      };
      const result = await evalRequest<{ revisionId: string }>(`/sources/${sourceId}/excerpts`, "POST", body, saveKey.current);
      saveKey.current = crypto.randomUUID();
      const fresh = await evalRequest<SourceDetail>(`/sources/${sourceId}?orgId=${encodeURIComponent(orgId)}`);
      onSaved({ revisionId: fresh.revisions?.[0]?.id ?? result.revisionId, chunks: fresh.chunks });
      notify(t("excerptSaved"));
      setEdits({});
      setRemoved(new Set());
      onOpenChange(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setSaving(false);
    }
  }

  const footer = readOnly ? undefined : (
    <div className="p-excerpts-foot">
      <span className="p-cell-meta" aria-live="polite">
        {changeCount ? (changeCount === 1 ? t("excerptChangesOne") : tv("excerptChanges", { n: changeCount })) : t("excerptNoChanges")}
      </span>
      <span className="p-toolbar-spacer" />
      <Action variant="ghost" size="sm" onClick={() => { setEdits({}); setRemoved(new Set()); setEditing(null); }} disabled={!changeCount || saving}>
        {t("excerptDiscard")}
      </Action>
      <Action size="sm" onClick={() => void save()} disabled={!changeCount || invalid || saving}>
        {saving ? t("excerptSaving") : t("excerptSave")}
      </Action>
    </div>
  );

  return (
    <SidePanel open={open} onOpenChange={close} wide title={source?.title ?? t("excerptsTitle")} description={t("excerptsHelp")} footer={footer}>
      {loadError && <Status error>{loadError}</Status>}
      {error && <Status error>{error}</Status>}
      {!detail && !loadError && (
        <div className="p-skeleton-page" role="status" aria-label={t("loading")}>
          <span className="p-skeleton" style={{ width: "100%", height: 72 }} />
          <span className="p-skeleton" style={{ width: "100%", height: 72 }} />
          <span className="p-skeleton" style={{ width: "100%", height: 72 }} />
        </div>
      )}
      {detail && (
        <div className="p-excerpts">
          <div className="p-excerpts-tools">
            <SearchInput value={query} onChange={setQuery} label={t("excerptSearch")} />
            <span className="p-cell-meta">{detail.total} {detail.total === 1 ? t("excerpt") : t("excerpts")}</span>
          </div>
          {detail.total > detail.chunks.length && <p className="p-field-hint">{tv("excerptPartial", { shown: detail.chunks.length, total: detail.total })}</p>}
          {visible.length === 0 && <p className="p-cell-meta">{t("excerptNoMatches")}</p>}
          <ol className="p-excerpt-list">
            {visible.map(({ chunk, index }) => {
              const isRemoved = removed.has(chunk.id);
              const value = edits[chunk.id] ?? chunk.excerpt;
              const isEdited = changed.includes(chunk.id);
              return (
                <li key={chunk.id} className="p-excerpt-item" data-state={isRemoved ? "removed" : isEdited ? "edited" : undefined}>
                  <div className="p-excerpt-item-head">
                    <span className="p-excerpt-num">{tv("excerptNumber", { n: index + 1 })}</span>
                    {isEdited && !isRemoved && <Badge tone="info">{t("excerptEdited")}</Badge>}
                    {isRemoved && <Badge tone="fail">{t("excerptRemoved")}</Badge>}
                    <span className="p-toolbar-spacer" />
                    {!readOnly && !isRemoved && editing !== chunk.id && (
                      <button type="button" className="p-btn" data-variant="ghost" data-size="sm" onClick={() => { setEdits((current) => ({ ...current, [chunk.id]: current[chunk.id] ?? chunk.excerpt })); setEditing(chunk.id); }}>
                        <Pencil aria-hidden="true" />
                        {t("excerptEdit")}
                      </button>
                    )}
                    {!readOnly && isEdited && !isRemoved && editing !== chunk.id && (
                      <button type="button" className="p-btn" data-variant="ghost" data-size="sm" onClick={() => setEdits(({ [chunk.id]: _dropped, ...rest }) => rest)}>
                        <RotateCcw aria-hidden="true" />
                        {t("excerptRevert")}
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        className="p-btn"
                        data-variant="ghost"
                        data-size="sm"
                        data-shape={isRemoved ? undefined : "icon"}
                        aria-label={isRemoved ? undefined : `${t("excerptRemove")}: ${tv("excerptNumber", { n: index + 1 })}`}
                        title={isRemoved ? undefined : t("excerptRemove")}
                        onClick={() => {
                          setRemoved((current) => {
                            const next = new Set(current);
                            if (next.has(chunk.id)) next.delete(chunk.id);
                            else next.add(chunk.id);
                            return next;
                          });
                          if (editing === chunk.id) setEditing(null);
                        }}
                      >
                        {isRemoved ? <RotateCcw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                        {isRemoved && t("excerptRestore")}
                      </button>
                    )}
                  </div>
                  {editing === chunk.id ? (
                    <div className="p-excerpt-editor">
                      <textarea
                        aria-label={tv("excerptNumber", { n: index + 1 })}
                        value={value}
                        rows={Math.min(14, Math.max(4, Math.ceil(value.length / 90)))}
                        maxLength={4096}
                        autoFocus
                        onChange={(event) => setEdits((current) => ({ ...current, [chunk.id]: event.target.value }))}
                      />
                      <div className="p-excerpt-editor-foot">
                        <span className="p-cell-meta">{value.trim() ? tv("excerptCharacters", { n: value.length }) : t("excerptEmpty")}</span>
                        <span className="p-toolbar-spacer" />
                        <Action variant="ghost" size="sm" onClick={() => { setEdits(({ [chunk.id]: _dropped, ...rest }) => rest); setEditing(null); }}>
                          {t("cancel")}
                        </Action>
                        <Action variant="secondary" size="sm" disabled={!value.trim()} onClick={() => setEditing(null)}>
                          <CheckIcon aria-hidden="true" />
                          {t("excerptDone")}
                        </Action>
                      </div>
                    </div>
                  ) : (
                    <ClampedText text={value} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </SidePanel>
  );
}

function ClampedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div className="p-excerpt-body">
      <p className="p-excerpt-copy" data-clamped={long && !open ? "true" : undefined}>
        {text}
      </p>
      {long && (
        <button type="button" className="p-link-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? t("excerptShowLess") : t("excerptShowMore")}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- scope --- */

export type Complexity = "foundational" | "balanced" | "expert";
export const SCOPE_SIZES = [
  { value: 10, label: "scopeQuick", help: "scopeQuickHelp", minutes: 3 },
  { value: 25, label: "scopeStandard", help: "scopeStandardHelp", minutes: 8 },
  { value: 50, label: "scopeThorough", help: "scopeThoroughHelp", minutes: 15 },
  { value: 100, label: "scopeProfessional", help: "scopeProfessionalHelp", minutes: 30 },
] as const satisfies ReadonlyArray<{ value: number; label: MessageKey; help: MessageKey; minutes: number }>;
const COMPLEXITIES: ReadonlyArray<{ value: Complexity; label: MessageKey; help: MessageKey }> = [
  { value: "foundational", label: "complexityFoundational", help: "complexityFoundationalHelp" },
  { value: "balanced", label: "complexityBalanced", help: "complexityBalancedHelp" },
  { value: "expert", label: "complexityExpert", help: "complexityExpertHelp" },
];

/** How many tests to write and how demanding they are. */
export function ScopePicker({
  size,
  complexity,
  disabled,
  onSize,
  onComplexity,
}: {
  size: number;
  complexity: Complexity;
  disabled?: boolean;
  onSize: (value: number) => void;
  onComplexity: (value: Complexity) => void;
}) {
  const selected = COMPLEXITIES.find((item) => item.value === complexity) ?? COMPLEXITIES[1];
  return (
    <div className="p-scope">
      <fieldset className="p-scope-group" disabled={disabled}>
        <legend>{t("scopeSize")}</legend>
        <div className="p-scope-sizes" role="radiogroup" aria-label={t("scopeSize")}>
          {SCOPE_SIZES.map((option) => (
            <label key={option.value} className="p-scope-size" data-checked={size === option.value ? "true" : undefined}>
              <input type="radio" name="scope-size" value={option.value} checked={size === option.value} onChange={() => onSize(option.value)} />
              <span className="p-scope-size-count">{option.value}</span>
              <span className="p-scope-size-label">{t(option.label)}</span>
              <span className="p-scope-size-help">{t(option.help)}</span>
              <span className="p-scope-size-time">{tv("scopeMinutes", { n: option.minutes })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="p-scope-group" disabled={disabled}>
        <legend>{t("scopeDifficulty")}</legend>
        <div className="p-segmented" role="radiogroup" aria-label={t("scopeDifficulty")}>
          {COMPLEXITIES.map((option) => (
            <label key={option.value} className="p-segment">
              <input type="radio" name="scope-complexity" value={option.value} checked={complexity === option.value} onChange={() => onComplexity(option.value)} />
              <span>{t(option.label)}</span>
            </label>
          ))}
        </div>
        <p className="p-field-hint">{t(selected.help)}</p>
      </fieldset>
      <p className="p-field-hint">{tv("scopeUpTo", { n: size })}</p>
    </div>
  );
}

/* ------------------------------------------------------------ questions --- */

export type ContextQuestion = { id: string; field: string; question: string; critical: boolean; status: string; jobId?: string | null; why?: string | null; suggestions?: string[] };

function questionWhy(item: ContextQuestion) {
  if (item.why) return item.why;
  if (item.field === "purpose") return t("contextWhyFallback_purpose");
  if (item.field === "languages") return t("contextWhyFallback_languages");
  return t("contextWhyFallback_other");
}
function questionPlaceholder(field: string) {
  if (field === "languages") return t("contextLanguagesPlaceholder");
  if (field === "as_of") return t("contextDatePlaceholder");
  return t("contextAnswerPlaceholder");
}
/** Clicking a suggestion adds it to the answer, or removes it again; list fields take several. */
function toggleSuggestion(current: string, suggestion: string, multiple: boolean) {
  const parts = current.split(/\s*[,;\n]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.includes(suggestion)) return parts.filter((part) => part !== suggestion).join(", ");
  if (!multiple) return suggestion;
  return [...parts, suggestion].join(", ");
}
const LIST_FIELDS = new Set(["intended_users", "tasks", "languages", "business_boundaries", "supported_capabilities", "material_risks", "allowed_actions", "tool_descriptions"]);

/**
 * The few questions the material could not settle. Every answer is optional:
 * a blank answer is saved as skipped and preparation continues from the sources.
 */
export function ContextQuestionsForm({
  questions,
  pending,
  error,
  onSubmit,
}: {
  questions: ContextQuestion[];
  pending: boolean;
  error: string;
  onSubmit: (answers: Array<{ questionId: string; answer: string | null }>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answered = questions.filter((item) => answers[item.id]?.trim()).length;
  const submit = (skipAll: boolean) =>
    onSubmit(questions.map((item) => ({ questionId: item.id, answer: skipAll ? null : answers[item.id]?.trim() || null })));
  return (
    <form
      className="p-context"
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <div className="p-context-head">
        <h3>{t("contextNeeded")}</h3>
        <p className="p-cell-meta">{t("contextNeededHelp")}</p>
      </div>
      {error && <Status error>{error}</Status>}
      <ol className="p-context-list">
        {questions.map((item, index) => (
          <li key={item.id} className="p-context-item">
            <span className="p-context-step" aria-hidden="true">{index + 1}</span>
            <div className="p-context-body">
              <label htmlFor={`context-${item.id}`} className="p-context-question">
                <span className="sr-only">{tv("contextQuestionOf", { i: index + 1, n: questions.length })}: </span>
                {item.question}
              </label>
              <p className="p-context-why">
                <Info aria-hidden="true" />
                {questionWhy(item)}
              </p>
              {!!item.suggestions?.length && (
                <div className="p-context-suggestions" role="group" aria-label={t("contextSuggestions")}>
                  {item.suggestions.map((suggestion) => {
                    const active = (answers[item.id] ?? "").split(/\s*[,;\n]\s*/).includes(suggestion);
                    return (
                      <Chip key={suggestion} active={active} disabled={pending} onClick={() => setAnswers((current) => ({ ...current, [item.id]: toggleSuggestion(current[item.id] ?? "", suggestion, LIST_FIELDS.has(item.field)) }))}>
                        {suggestion}
                      </Chip>
                    );
                  })}
                </div>
              )}
              <textarea
                id={`context-${item.id}`}
                className="p-context-input"
                rows={2}
                maxLength={2000}
                placeholder={questionPlaceholder(item.field)}
                value={answers[item.id] ?? ""}
                disabled={pending}
                onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))}
              />
            </div>
          </li>
        ))}
      </ol>
      <div className="p-context-foot">
        <Action variant="ghost" onClick={() => submit(true)} disabled={pending}>
          {t("contextSkipAll")}
        </Action>
        <Action type="submit" disabled={pending || !answered}>
          {pending ? t("savingResuming") : answered === 1 ? t("contextContinueOne") : answered ? tv("contextContinueCount", { n: answered }) : t("contextContinue")}
        </Action>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- review --- */

type ReviewCase = {
  caseRevisionId: string;
  question: string;
  expected: string;
  difficulty: string | null;
  severity: string | null;
  excerpts: Array<{ sourceTitle: string; excerpt: string }>;
};
type TestSetView = {
  draft: { version: number; caseCount: number } | null;
  versions?: Array<{ id: string; created_at: string }>;
  cases: Array<{ caseRevisionId: string; document: CefCase; excerpts: Array<{ sourceRevisionId: string; sourceTitle: string; anchor: string; excerpt: string }> }>;
};
export type CasePreview = { caseRevisionId: string; question: string; approvedAnswer: string; sourceExcerpt: string | null };

const DIFFICULTIES = ["routine", "advanced", "challenge"] as const;
const PAGE = 20;
const DIFFICULTY_TONE: Record<string, "neutral" | "info" | "warn"> = { routine: "neutral", advanced: "info", challenge: "warn" };

// With no draft left, the test set was already frozen: approve its newest version.
function latestVersion(view: TestSetView) {
  return [...(view.versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null;
}

function expectedText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The generated draft as the customer reviews it: the current draft (edits
 * included), searchable and filterable, with each answer shown inside the
 * excerpt that supports it.
 */
export function TestSetReview({
  orgId,
  suiteId,
  previews,
  editorHref,
  pending,
  error,
  onApprove,
}: {
  orgId: string;
  suiteId: string;
  previews: CasePreview[];
  editorHref: string;
  pending: boolean;
  error: string;
  onApprove: (draftVersion: number | null, count: number, frozenVersionId: string | null) => void;
}) {
  const [view, setView] = useState<TestSetView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | (typeof DIFFICULTIES)[number]>("all");
  const [limit, setLimit] = useState(PAGE);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function load() {
    try {
      setView(await evalRequest<TestSetView>(`/suites/${suiteId}/view?orgId=${encodeURIComponent(orgId)}&version=draft`));
    } catch {
      setView(null);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, suiteId]);

  const cases: ReviewCase[] = useMemo(() => {
    if (view?.cases.length)
      return view.cases.map((item) => ({
        caseRevisionId: item.caseRevisionId,
        question: item.document.scenario.messages.find((message) => message.role === "user")?.content ?? "",
        expected: expectedText(item.document.reference.expected),
        difficulty: item.document.difficulty ?? null,
        severity: item.document.severity ?? null,
        excerpts: item.excerpts.map((excerpt) => ({ sourceTitle: excerpt.sourceTitle, excerpt: excerpt.excerpt })),
      }));
    return previews.map((item) => ({ caseRevisionId: item.caseRevisionId, question: item.question, expected: item.approvedAnswer, difficulty: null, severity: null, excerpts: item.sourceExcerpt ? [{ sourceTitle: "", excerpt: item.sourceExcerpt }] : [] }));
  }, [view, previews]);

  const counts = useMemo(() => Object.fromEntries(DIFFICULTIES.map((value) => [value, cases.filter((item) => item.difficulty === value).length])) as Record<(typeof DIFFICULTIES)[number], number>, [cases]);
  const sources = useMemo(() => new Set(cases.flatMap((item) => item.excerpts.map((excerpt) => excerpt.sourceTitle)).filter(Boolean)).size, [cases]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return cases
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => difficulty === "all" || item.difficulty === difficulty)
      .filter(({ item }) => !needle || item.question.toLocaleLowerCase().includes(needle) || item.expected.toLocaleLowerCase().includes(needle));
  }, [cases, query, difficulty]);
  const editable = !!view?.draft;

  async function remove(caseRevisionId: string) {
    setRemoving(caseRevisionId);
    setActionError("");
    try {
      await evalRequest(`/suites/${suiteId}/cases/${caseRevisionId}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("reviewRemoved"));
      setConfirming(null);
      await load();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : t("error"));
    } finally {
      setRemoving(null);
    }
  }

  const hasDifficulty = DIFFICULTIES.some((value) => counts[value] > 0);

  return (
    <section className="p-prep p-review" aria-live="polite">
      <div className="p-review-head">
        <div>
          <h2 className="p-review-title">{t("reviewTestSet")}</h2>
          <p className="p-cell-meta">{t("reviewTestSetHelp")}</p>
        </div>
        {cases.length > 0 && (
          <dl className="p-review-stats">
            <div>
              <dt>{t("scopeTests")}</dt>
              <dd>{cases.length}</dd>
            </div>
            {sources > 0 && (
              <div>
                <dt>{sources === 1 ? t("reviewSource") : t("reviewSources")}</dt>
                <dd>{sources}</dd>
              </div>
            )}
            {hasDifficulty &&
              DIFFICULTIES.map((value) => (
                <div key={value}>
                  <dt>{t(`difficulty_${value}` as MessageKey)}</dt>
                  <dd>{counts[value]}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>
      {(error || actionError) && <Status error>{error || actionError}</Status>}

      {!loaded && !previews.length ? (
        <div className="p-skeleton-page" role="status" aria-label={t("loading")}>
          <span className="p-skeleton" style={{ width: "100%", height: 120 }} />
          <span className="p-skeleton" style={{ width: "100%", height: 120 }} />
        </div>
      ) : !cases.length ? (
        <Status>{t("draftLoading")}</Status>
      ) : (
        <>
          <div className="p-review-tools">
            <SearchInput value={query} onChange={(value) => { setQuery(value); setLimit(PAGE); }} label={t("reviewSearch")} />
            {hasDifficulty && (
              <FilterChips
                label={t("reviewFilter")}
                value={difficulty}
                onChange={(value) => { setDifficulty(value); setLimit(PAGE); }}
                options={[
                  { value: "all" as const, label: t("reviewAll"), count: cases.length },
                  ...DIFFICULTIES.filter((value) => counts[value] > 0).map((value) => ({ value, label: t(`difficulty_${value}` as MessageKey), count: counts[value] })),
                ]}
              />
            )}
          </div>
          {!filtered.length && <p className="p-cell-meta">{t("reviewNoMatches")}</p>}
          <ol className="p-review-list">
            {filtered.slice(0, limit).map(({ item, index }) => (
              <li key={item.caseRevisionId} className="p-review-case">
                <div className="p-review-case-head">
                  <span className="p-case-index">{index + 1}</span>
                  <p className="p-review-question">{item.question}</p>
                  <div className="p-review-case-meta">
                    {item.difficulty && <Badge tone={DIFFICULTY_TONE[item.difficulty] ?? "neutral"}>{t(`difficulty_${item.difficulty}` as MessageKey)}</Badge>}
                    {item.severity && <StatusBadge value={item.severity} />}
                    {editable &&
                      (confirming === item.caseRevisionId ? (
                        <span className="p-review-confirm">
                          <Action variant="danger" size="sm" onClick={() => void remove(item.caseRevisionId)} disabled={removing === item.caseRevisionId}>
                            {t("reviewRemoveTest")}
                          </Action>
                          <button type="button" className="p-btn" data-variant="ghost" data-shape="icon" data-size="sm" aria-label={t("cancel")} onClick={() => setConfirming(null)}>
                            <X aria-hidden="true" />
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="p-btn" data-variant="ghost" data-shape="icon" data-size="sm" aria-label={`${t("reviewRemoveTest")} ${index + 1}`} title={t("reviewRemoveTest")} disabled={!!removing || pending} onClick={() => setConfirming(item.caseRevisionId)}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      ))}
                  </div>
                </div>
                <div className="p-review-case-body">
                  <div className="p-review-answer">
                    <span className="p-review-label">{t("expectedAnswer")}</span>
                    <p>{item.expected}</p>
                  </div>
                  <div className="p-review-source">
                    <span className="p-review-label">{t("sourceExcerpt")}</span>
                    {item.excerpts.length ? (
                      item.excerpts.map((excerpt, excerptIndex) => (
                        <Fragment key={excerptIndex}>
                          <ExcerptSnippet excerpt={excerpt.excerpt} answer={item.expected} source={excerpt.sourceTitle || undefined} />
                        </Fragment>
                      ))
                    ) : (
                      <span className="p-cell-meta">{t("sourceExcerptMissing")}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {filtered.length > limit && (
            <div className="p-row p-review-more">
              <Action variant="secondary" size="sm" onClick={() => setLimit((value) => value + PAGE)}>
                {tv("reviewShowMoreTests", { n: Math.min(PAGE, filtered.length - limit) })}
              </Action>
            </div>
          )}
        </>
      )}

      <div className="p-review-bar">
        <span className="p-cell-meta">{t("approveHelp")}</span>
        <ActionLink variant="secondary" href={editorHref}>
          {t("reviewEditTestSet")}
        </ActionLink>
        <Action onClick={() => onApprove(view?.draft?.version ?? null, cases.length, view && !view.draft ? latestVersion(view) : null)} disabled={pending || !cases.length}>
          {pending ? t("saving") : `${t("approveTestSet")} (${cases.length})`}
        </Action>
      </div>
    </section>
  );
}
