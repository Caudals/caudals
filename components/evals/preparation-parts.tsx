"use client";

/**
 * Pieces of test-set preparation: the excerpt viewer/editor for a piece of
 * reference material, the scope picker (size and difficulty), the optional
 * context questions and the review of a generated draft.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check as CheckIcon, CircleCheck, FileText, Info, Keyboard, ListChecks, Pencil, Play, RotateCcw, Trash2, X } from "lucide-react";
import type { CefCase } from "@/lib/evals/contracts/cases";
import { SPOT_CHECK_SIZE, spotCheckRequired, spotCheckSample, type ReviewMode } from "@/lib/evals/review/spot-check";
import { evalRequest } from "./api";
import { Action, ActionLink, Badge, Chip, FilterChips, InlineSelect, SearchInput, Status, StatusBadge, TextArea } from "./primitives";
import { Modal, SidePanel, notify } from "./overlays";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

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
  /** The source page its first excerpt cites (the source-page filter and the spot-check spread). */
  source: string | null;
  excerpts: Array<{ sourceTitle: string; excerpt: string }>;
  document: CefCase | null;
};
type TestSetView = {
  draft: { version: number; caseCount: number } | null;
  versions?: Array<{ id: string; created_at: string }>;
  cases: Array<{ caseRevisionId: string; document: CefCase; excerpts: Array<{ sourceRevisionId: string; sourceTitle: string; anchor: string; excerpt: string }> }>;
};
export type CasePreview = { caseRevisionId: string; question: string; approvedAnswer: string; sourceExcerpt: string | null };
/** How the person reviewed the set, sent with the approval and recorded in the audit trail (launch L-22). */
export type ReviewRecord = { mode: ReviewMode; checkedCaseRevisionIds: string[]; approvedCaseRevisionIds: string[] };

const DIFFICULTIES = ["routine", "advanced", "challenge"] as const;
const PAGE = 20;
const DIFFICULTY_TONE: Record<string, "neutral" | "info" | "warn"> = { routine: "neutral", advanced: "info", challenge: "warn" };
/** Review shortcuts (launch L-22); also documented in docs/FRONTEND.md. */
const SHORTCUTS: Array<[string, MessageKey]> = [
  ["j", "shortcutNext"],
  ["k", "shortcutPrevious"],
  ["c", "shortcutCheck"],
  ["x", "shortcutSelect"],
  ["e", "shortcutEdit"],
  ["r", "shortcutRemove"],
  ["/", "shortcutSearch"],
  ["?", "shortcutHelp"],
];

// With no draft left, the test set was already frozen: approve its newest version.
function latestVersion(view: TestSetView) {
  return [...(view.versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null;
}

function expectedText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Spot-check progress survives a reload in this tab (best effort). */
function storedReview(suiteId: string): { sample: string[]; checked: string[]; approved: string[] } {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(`caudals.review.${suiteId}`) ?? "null");
    if (value && Array.isArray(value.sample) && Array.isArray(value.checked)) return { sample: value.sample, checked: value.checked, approved: Array.isArray(value.approved) ? value.approved : [] };
  } catch {
    /* storage unavailable */
  }
  return { sample: [], checked: [], approved: [] };
}
function storeReview(suiteId: string, value: { sample: string[]; checked: string[]; approved: string[] }) {
  try {
    window.sessionStorage.setItem(`caudals.review.${suiteId}`, JSON.stringify(value));
  } catch {
    /* best effort */
  }
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The generated draft as the customer reviews it (launch L-22, P-17).
 *
 * Free and pay-as-you-go workspaces start with a spot check: ten questions
 * spread across the source pages, the most severe first, each marked "Looks
 * right", edited or removed; then "Approve and run". The full review (every
 * question, searchable, filterable by difficulty and source page, with bulk
 * select, mark as checked and remove) is one click away, and is the only mode
 * for managed workspaces. Each answer is shown inside the excerpt that
 * supports it, and questions can be edited in place. Keyboard shortcuts:
 * j/k move, c checks, x selects, e edits, r removes, / searches, ? lists them.
 */
export function TestSetReview({
  orgId,
  suiteId,
  previews,
  editorHref,
  pending,
  error,
  mode = "full",
  canRun = false,
  onApprove,
}: {
  orgId: string;
  suiteId: string;
  previews: CasePreview[];
  editorHref: string;
  pending: boolean;
  error: string;
  /** The workspace's default: a spot check (free, pay as you go) or the full review (managed). */
  mode?: ReviewMode;
  /** Offer "Approve and run" (the person can start runs here). */
  canRun?: boolean;
  onApprove: (draftVersion: number | null, count: number, frozenVersionId: string | null, review: ReviewRecord, andRun: boolean) => void;
}) {
  const [view, setView] = useState<TestSetView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | (typeof DIFFICULTIES)[number]>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [full, setFull] = useState(mode === "full");
  const [sample, setSample] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRemove, setBulkRemove] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [shortcuts, setShortcuts] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

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
        source: item.excerpts[0]?.sourceTitle || null,
        excerpts: item.excerpts.map((excerpt) => ({ sourceTitle: excerpt.sourceTitle, excerpt: excerpt.excerpt })),
        document: item.document,
      }));
    return previews.map((item) => ({ caseRevisionId: item.caseRevisionId, question: item.question, expected: item.approvedAnswer, difficulty: null, severity: null, source: null, excerpts: item.sourceExcerpt ? [{ sourceTitle: "", excerpt: item.sourceExcerpt }] : [], document: null }));
  }, [view, previews]);
  const editable = !!view?.draft;

  // The spot-check sample: restored for this tab, topped up when a question in it was removed.
  useEffect(() => {
    if (!cases.length) return;
    const items = cases.map((item) => ({ id: item.caseRevisionId, source: item.source, severity: item.severity }));
    const saved = restored.current ? null : storedReview(suiteId);
    restored.current = true;
    setSample((current) => spotCheckSample(items, saved ? saved.sample : current));
    if (saved) {
      setChecked(new Set(saved.checked));
      setApproved(new Set(saved.approved));
    }
  }, [cases, suiteId]);
  useEffect(() => {
    if (restored.current) storeReview(suiteId, { sample, checked: [...checked], approved: [...approved] });
  }, [suiteId, sample, checked, approved]);

  const present = useMemo(() => new Set(cases.map((item) => item.caseRevisionId)), [cases]);
  const counts = useMemo(() => Object.fromEntries(DIFFICULTIES.map((value) => [value, cases.filter((item) => item.difficulty === value).length])) as Record<(typeof DIFFICULTIES)[number], number>, [cases]);
  const sourcePages = useMemo(() => {
    const pages = new Map<string, number>();
    for (const item of cases) if (item.source) pages.set(item.source, (pages.get(item.source) ?? 0) + 1);
    return [...pages];
  }, [cases]);
  const sources = useMemo(() => new Set(cases.flatMap((item) => item.excerpts.map((excerpt) => excerpt.sourceTitle)).filter(Boolean)).size, [cases]);
  const filtered = useMemo(() => {
    if (!full) {
      const position = new Map(cases.map((item, index) => [item.caseRevisionId, index]));
      return sample.filter((id) => position.has(id)).map((id) => ({ item: cases[position.get(id)!], index: position.get(id)! })).sort((a, b) => a.index - b.index);
    }
    const needle = query.trim().toLocaleLowerCase();
    return cases
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => difficulty === "all" || item.difficulty === difficulty)
      .filter(({ item }) => sourceFilter === "all" || item.source === sourceFilter)
      .filter(({ item }) => !needle || item.question.toLocaleLowerCase().includes(needle) || item.expected.toLocaleLowerCase().includes(needle));
  }, [cases, query, difficulty, sourceFilter, full, sample]);
  const shown = full ? filtered.slice(0, limit) : filtered;
  const checkedCount = [...checked].filter((id) => present.has(id)).length;
  const sampleChecked = sample.filter((id) => checked.has(id) && present.has(id)).length;
  const required = spotCheckRequired(cases.length);
  const spotCheckDone = sampleChecked >= required;
  const selectedShown = shown.filter(({ item }) => selected.has(item.caseRevisionId)).length;

  const toggle = (set: Set<string>, id: string, on?: boolean) => {
    const next = new Set(set);
    if (on ?? !next.has(id)) next.add(id);
    else next.delete(id);
    return next;
  };
  function markChecked(id: string, on?: boolean) {
    const value = on ?? !checked.has(id);
    setChecked((current) => toggle(current, id, value));
    setApproved((current) => toggle(current, id, value));
  }

  async function remove(caseRevisionId: string) {
    setRemoving(caseRevisionId);
    setActionError("");
    try {
      await evalRequest(`/suites/${suiteId}/cases/${caseRevisionId}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("reviewRemoved"));
      setConfirming(null);
      setSelected((current) => toggle(current, caseRevisionId, false));
      await load();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : t("error"));
    } finally {
      setRemoving(null);
    }
  }
  async function removeSelected() {
    const ids = [...selected].filter((id) => present.has(id));
    if (!ids.length) return;
    setBulkPending(true);
    setActionError("");
    try {
      await evalRequest(`/suites/${suiteId}/cases/remove`, "POST", { orgId, caseRevisionIds: ids });
      notify(tv("reviewRemovedMany", { n: ids.length }));
      setSelected(new Set());
      setBulkRemove(false);
      await load();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : t("error"));
      setBulkRemove(false);
    } finally {
      setBulkPending(false);
    }
  }
  function markSelected() {
    const ids = [...selected].filter((id) => present.has(id));
    setChecked((current) => new Set([...current, ...ids]));
    setApproved((current) => new Set([...current, ...ids]));
    notify(tv("reviewMarkedMany", { n: ids.length }));
    setSelected(new Set());
  }
  async function saved(previous: string, next: string) {
    // An edited question has been read and corrected: it counts as checked under its new id.
    setChecked((current) => new Set([...[...current].filter((id) => id !== previous), next]));
    setApproved((current) => toggle(current, previous, false));
    setSample((current) => current.map((id) => (id === previous ? next : id)));
    setEditing(null);
    notify(t("caseSaved"));
    await load();
  }

  const approve = (andRun: boolean) => {
    const ids = [...checked].filter((id) => present.has(id));
    onApprove(view?.draft?.version ?? null, cases.length, view && !view.draft ? latestVersion(view) : null, {
      mode: full ? "full" : "spot_check",
      checkedCaseRevisionIds: ids,
      approvedCaseRevisionIds: [...approved].filter((id) => present.has(id)),
    }, andRun);
  };

  // Keyboard shortcuts, while no field, dialog or menu has the keyboard.
  const focusCase = useCallback((index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>("[data-review-case]");
    if (!items?.length) return;
    const next = Math.max(0, Math.min(items.length - 1, index));
    setFocused(next);
    items[next].focus();
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || document.querySelector("[role=dialog],[role=menu]")) return;
      const current = shown[Math.min(focused, shown.length - 1)]?.item;
      const handled = (() => {
        switch (event.key) {
          case "j": focusCase(focused + 1); return true;
          case "k": focusCase(focused - 1); return true;
          case "c": if (current) markChecked(current.caseRevisionId); return !!current;
          case "x": if (current && full) setSelected((value) => toggle(value, current.caseRevisionId)); return !!current && full;
          case "e": if (current && editable && current.document) setEditing(current.caseRevisionId); return !!current;
          case "r": if (current && editable && cases.length > 1) setConfirming(current.caseRevisionId); return !!current;
          case "/": if (full) searchRef.current?.querySelector("input")?.focus(); else setFull(true); return true;
          case "?": setShortcuts(true); return true;
          default: return false;
        }
      })();
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hasDifficulty = DIFFICULTIES.some((value) => counts[value] > 0);
  const runLabel = (count: number) => `${t("approveAndRun")} (${count})`;

  return (
    <section className="p-prep p-review" aria-live="polite">
      <div className="p-review-head">
        <div>
          <h2 className="p-review-title">{full ? t("reviewTestSet") : tv("spotCheckTitle", { n: required || SPOT_CHECK_SIZE })}</h2>
          <p className="p-cell-meta">{full ? t("reviewTestSetHelp") : tv("spotCheckHelp", { rest: Math.max(0, cases.length - sample.length) })}</p>
        </div>
        {cases.length > 0 && (
          <dl className="p-review-stats">
            {!full && (
              <div>
                <dt>{t("spotCheckChecked")}</dt>
                <dd>{sampleChecked}/{required}</dd>
              </div>
            )}
            <div>
              <dt>{t("scopeTests")}</dt>
              <dd>{cases.length}</dd>
            </div>
            {full && checkedCount > 0 && (
              <div>
                <dt>{t("reviewCheckedCount")}</dt>
                <dd>{checkedCount}</dd>
              </div>
            )}
            {sources > 0 && (
              <div>
                <dt>{sources === 1 ? t("reviewSource") : t("reviewSources")}</dt>
                <dd>{sources}</dd>
              </div>
            )}
            {full && hasDifficulty &&
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
            {full ? (
              <>
                <div ref={searchRef} className="p-review-search">
                  <SearchInput value={query} onChange={(value) => { setQuery(value); setLimit(PAGE); }} label={t("reviewSearch")} />
                </div>
                {sourcePages.length > 1 && (
                  <InlineSelect id="review-source" label={t("reviewSourcePage")} value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setLimit(PAGE); }}>
                    <option value="all">{tv("reviewAllPages", { n: cases.length })}</option>
                    {sourcePages.map(([page, count]) => (
                      <option key={page} value={page}>{`${page} (${count})`}</option>
                    ))}
                  </InlineSelect>
                )}
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
              </>
            ) : (
              <Status>{t("spotCheckPreliminary")}</Status>
            )}
            <Action variant="ghost" size="sm" onClick={() => setShortcuts(true)} aria-keyshortcuts="?">
              <Keyboard aria-hidden="true" />
              {t("reviewShortcuts")}
            </Action>
          </div>
          {full && shown.length > 0 && (
            <div className="p-review-bulk" role="toolbar" aria-label={t("reviewBulkActions")}>
              <label className="p-check p-review-select-all">
                <input
                  type="checkbox"
                  checked={selectedShown > 0 && selectedShown === shown.length}
                  ref={(input) => { if (input) input.indeterminate = selectedShown > 0 && selectedShown < shown.length; }}
                  onChange={(event) => setSelected((current) => {
                    const next = new Set(current);
                    for (const { item } of shown) if (event.target.checked) next.add(item.caseRevisionId); else next.delete(item.caseRevisionId);
                    return next;
                  })}
                />
                <span className="p-check-label">{selected.size ? tv("reviewSelectedCount", { n: selected.size }) : tv("reviewSelectShown", { n: shown.length })}</span>
              </label>
              {selected.size > 0 && (
                <>
                  <Action variant="secondary" size="sm" onClick={markSelected}>
                    <CircleCheck aria-hidden="true" />
                    {t("reviewMarkChecked")}
                  </Action>
                  {editable && (
                    <Action variant="secondary" size="sm" onClick={() => setBulkRemove(true)} disabled={bulkPending || selected.size >= cases.length}>
                      <Trash2 aria-hidden="true" />
                      {t("reviewRemoveSelected")}
                    </Action>
                  )}
                  <Action variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{t("reviewClearSelection")}</Action>
                </>
              )}
            </div>
          )}
          {full && !filtered.length && <p className="p-cell-meta">{t("reviewNoMatches")}</p>}
          <ol className="p-review-list" ref={listRef} aria-label={full ? t("reviewTestSet") : t("spotCheckList")}>
            {shown.map(({ item, index }, position) => {
              const isChecked = checked.has(item.caseRevisionId);
              const title = `${t("question")} ${index + 1}`;
              return (
                <li
                  key={item.caseRevisionId}
                  className="p-review-case"
                  data-review-case=""
                  data-checked={isChecked ? "true" : undefined}
                  tabIndex={-1}
                  aria-label={title}
                  onFocus={() => setFocused(position)}
                >
                  <div className="p-review-case-head">
                    {full ? (
                      <input
                        type="checkbox"
                        className="p-review-select"
                        aria-label={`${t("reviewSelect")} ${index + 1}`}
                        checked={selected.has(item.caseRevisionId)}
                        onChange={() => setSelected((current) => toggle(current, item.caseRevisionId))}
                      />
                    ) : (
                      <span className="p-case-index">{index + 1}</span>
                    )}
                    <p className="p-review-question">{item.question}</p>
                    <div className="p-review-case-meta">
                      {isChecked && <Badge tone="pass" dot>{t("reviewCheckedBadge")}</Badge>}
                      {item.difficulty && <Badge tone={DIFFICULTY_TONE[item.difficulty] ?? "neutral"}>{t(`difficulty_${item.difficulty}` as MessageKey)}</Badge>}
                      {item.severity && <StatusBadge value={item.severity} />}
                    </div>
                  </div>
                  {editing === item.caseRevisionId && item.document ? (
                    <InlineCaseEditor orgId={orgId} suiteId={suiteId} caseRevisionId={item.caseRevisionId} document={item.document} onCancel={() => setEditing(null)} onSaved={(next) => void saved(item.caseRevisionId, next)} />
                  ) : (
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
                  )}
                  {editing !== item.caseRevisionId && (
                    <div className="p-review-case-actions">
                      <Action variant={isChecked ? "secondary" : "ghost"} size="sm" aria-pressed={isChecked} onClick={() => markChecked(item.caseRevisionId)}>
                        <CheckIcon aria-hidden="true" />
                        {t("reviewLooksRight")}
                        <span className="sr-only">: {title}</span>
                      </Action>
                      {editable && item.document && (
                        <Action variant="ghost" size="sm" onClick={() => setEditing(item.caseRevisionId)}>
                          <Pencil aria-hidden="true" />
                          {t("edit")}
                          <span className="sr-only">: {title}</span>
                        </Action>
                      )}
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
                          <Action variant="ghost" size="sm" aria-label={`${t("reviewRemoveTest")} ${index + 1}`} disabled={!!removing || pending || cases.length <= 1} onClick={() => setConfirming(item.caseRevisionId)}>
                            <Trash2 aria-hidden="true" />
                            {t("remove")}
                          </Action>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {full && filtered.length > limit && (
            <div className="p-row p-review-more">
              <Action variant="secondary" size="sm" onClick={() => setLimit((value) => value + PAGE)}>
                {tv("reviewShowMoreTests", { n: Math.min(PAGE, filtered.length - limit) })}
              </Action>
            </div>
          )}
        </>
      )}

      <div className="p-review-bar">
        <span className="p-cell-meta">{full ? t("approveHelp") : spotCheckDone ? tv("spotCheckReady", { n: cases.length }) : tv("spotCheckRemaining", { n: required - sampleChecked })}</span>
        {full ? (
          mode === "spot_check" && <Action variant="ghost" onClick={() => setFull(false)}>{t("spotCheckBack")}</Action>
        ) : (
          <Action variant="ghost" onClick={() => setFull(true)}>
            <ListChecks aria-hidden="true" />
            {tv("reviewAllQuestions", { n: cases.length })}
          </Action>
        )}
        {full && (
          <ActionLink variant="secondary" href={editorHref}>
            {t("reviewEditTestSet")}
          </ActionLink>
        )}
        {mode === "spot_check" && canRun ? (
          <>
            <Action variant="secondary" onClick={() => approve(false)} disabled={pending || !cases.length || (!full && !spotCheckDone)}>
              {t("approveOnly")}
            </Action>
            <Action onClick={() => approve(true)} disabled={pending || !cases.length || (!full && !spotCheckDone)}>
              <Play aria-hidden="true" />
              {pending ? t("saving") : runLabel(cases.length)}
            </Action>
          </>
        ) : (
          <Action onClick={() => approve(false)} disabled={pending || !cases.length || (!full && !spotCheckDone)}>
            {pending ? t("saving") : `${t("approveTestSet")} (${cases.length})`}
          </Action>
        )}
      </div>

      <Modal
        open={bulkRemove}
        onOpenChange={(open) => !bulkPending && setBulkRemove(open)}
        size="sm"
        title={tv("reviewRemoveSelectedTitle", { n: selected.size })}
        description={t("reviewRemoveSelectedHelp")}
        alert={actionError ? <Status error>{actionError}</Status> : null}
        footer={
          <>
            <Action variant="secondary" onClick={() => setBulkRemove(false)} disabled={bulkPending}>{t("cancel")}</Action>
            <Action variant="danger" onClick={() => void removeSelected()} disabled={bulkPending}>{bulkPending ? t("working") : t("reviewRemoveSelected")}</Action>
          </>
        }
      />
      <Modal open={shortcuts} onOpenChange={setShortcuts} size="sm" title={t("reviewShortcuts")} description={t("reviewShortcutsHelp")}>
        <dl className="p-shortcuts">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key}>
              <dt><kbd className="p-kbd">{key}</kbd></dt>
              <dd>{t(label)}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </section>
  );
}

/** Edit one question in place: its question and expected answer (the full editor keeps every field). */
function InlineCaseEditor({ orgId, suiteId, caseRevisionId, document, onSaved, onCancel }: {
  orgId: string; suiteId: string; caseRevisionId: string; document: CefCase; onSaved: (caseRevisionId: string) => void; onCancel: () => void;
}) {
  const messages = document.scenario.messages;
  const userIndex = Math.max(0, messages.findIndex((message) => message.role === "user"));
  const original = document.reference.expected;
  const json = typeof original !== "string";
  const [question, setQuestion] = useState(messages[userIndex]?.content ?? "");
  const [expected, setExpected] = useState(json ? JSON.stringify(original, null, 2) : original);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const changed = question !== (messages[userIndex]?.content ?? "") || expected !== (json ? JSON.stringify(original, null, 2) : original);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !changed) return;
    let value: unknown = expected;
    if (json) {
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
      const result = await evalRequest<{ caseRevisionId: string }>(`/suites/${suiteId}/cases/${caseRevisionId}`, "POST", {
        orgId,
        title: document.title,
        contents: messages.map((message, index) => (index === userIndex ? question : message.content)),
        expected: value,
      }, key.current);
      onSaved(result.caseRevisionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error"));
      setPending(false);
    }
  }
  return (
    <form className="p-stack p-review-edit" onSubmit={(event) => void save(event)}>
      <TextArea id={`review-question-${caseRevisionId}`} label={t("question")} value={question} rows={3} required onChange={(event) => setQuestion(event.target.value)} autoFocus />
      <TextArea id={`review-expected-${caseRevisionId}`} label={t("referenceAnswer")} hint={json ? t("referenceAnswerJson") : undefined} value={expected} rows={3} required onChange={(event) => setExpected(event.target.value)} />
      {changed && <Status>{t("keyFactsResetHint")}</Status>}
      {error && <Status error>{error}</Status>}
      <div className="p-row">
        <Action type="submit" variant="secondary" size="sm" disabled={pending || !changed || !question.trim() || !expected.trim()}>
          {pending ? t("saving") : t("saveCase")}
        </Action>
        <Action variant="ghost" size="sm" onClick={onCancel} disabled={pending}>{t("cancel")}</Action>
      </div>
    </form>
  );
}
