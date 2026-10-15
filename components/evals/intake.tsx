"use client";

/**
 * Better document intake (launch L-34, P-56; INTAKE_V2_ENABLED):
 *
 * - DocumentIntake: drag and drop (or the picker, or the keyboard) of up to 50
 *   files. Type and size are checked first, duplicates are skipped by content
 *   hash, and every file shows its own progress and outcome without failing
 *   the batch.
 * - HelpCentreImport: a help-centre or sitemap address becomes one website
 *   source of the pages the person selects, with the plan's cap and a credit
 *   estimate shown before anything is read.
 * - ScanNotice: the per-file ask for a PDF that looks scanned.
 * - ContextConfirmation: "What we understood about your assistant", confirmed
 *   or corrected on one screen before the tests are written.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, FileText, Globe, Pencil, RotateCcw, Upload } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, Badge, Field, Progress, SelectField, Status, TextArea } from "./primitives";
import { Modal, notify } from "./overlays";
import { checkIntake, duplicateVerdicts, INTAKE_ACCEPT, sha256Hex, type IntakeRejection } from "@/lib/evals/intake/upload-plan";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

/* -------------------------------------------------------------- shared --- */

export type ScanInfo = { suspected: boolean; pages: number | null; chars: number | null; empty: number | null };
type Chunk = { id: string; excerpt: string };
type SourceDetail = {
  title?: string;
  chunks: Chunk[];
  chunkCount?: number;
  revisions?: Array<{ id: string }>;
  ingestion?: { status: string; source_revision_id: string | null; reason_code: string | null; scan_suspected?: boolean; page_count?: number | null; text_chars?: number | null; empty_pages?: number | null } | null;
};
export type IntakeReady = { id: string; title: string; revisionId: string; chunks: Chunk[]; chunkCount: number; kind: "document"; scan: ScanInfo | null };
export type IntakePending = { id: string; title: string; kind: "document" | "website"; state: "reading" | "failed"; reason: string | null };

export function scanInfo(ingestion: SourceDetail["ingestion"]): ScanInfo | null {
  if (!ingestion || (!ingestion.scan_suspected && ingestion.reason_code !== "pdf_scanned")) return null;
  return { suspected: true, pages: ingestion.page_count ?? null, chars: ingestion.text_chars ?? null, empty: ingestion.empty_pages ?? null };
}

async function stableKey(action: string, payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `${action}-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);

/* ------------------------------------------------------ document intake --- */

type ItemState = "queued" | "checking" | "uploading" | "reading" | "ready" | "duplicate" | "failed";
/** One file of the batch: its own state, progress and outcome (a catalog message, or the server's curated sentence). */
type Item = { key: string; name: string; size: number; state: ItemState; progress: number; message: MessageKey | null; detail?: string; retry: boolean };

const REJECTION: Record<IntakeRejection, MessageKey> = {
  type: "intakeErrorType", empty: "intakeErrorEmpty", size: "intakeErrorSize", count: "intakeErrorCount", total: "intakeErrorTotal",
};

class UploadFailure extends Error {}

/** PUT the bytes with upload progress (fetch has none). Same-origin cookies, no extra headers, as before. */
function putWithProgress(url: string, body: ArrayBuffer, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / Math.max(1, event.total)); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadFailure(String(request.status))));
    request.onerror = () => reject(new UploadFailure("network"));
    request.onabort = () => reject(new UploadFailure("aborted"));
    request.send(body);
  });
}

export function DocumentIntake({
  orgId,
  evaluationId,
  projectId,
  existingFiles,
  disabled,
  inputRef,
  onReady,
  onPending,
  onChanged,
}: {
  orgId: string;
  evaluationId: string;
  projectId: string;
  /** Documents already in this evaluation (ready, reading or failed). */
  existingFiles: number;
  disabled?: boolean;
  /** The hidden file input, so other actions ("Upload a text version") can open the picker. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onReady: (source: IntakeReady) => void;
  onPending: (source: IntakePending) => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const files = useRef(new Map<string, File>());
  const hashes = useRef(new Map<string, string>());
  const known = useRef(new Set<string>());
  const running = useRef(0);
  const queue = useRef<string[]>([]);
  const localInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? localInput;
  const counter = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const update = useCallback((key: string, patch: Partial<Item>) => {
    if (mounted.current) setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const uploadOne = useCallback(async (key: string) => {
    const file = files.current.get(key);
    const hash = hashes.current.get(key);
    if (!file || !hash) return;
    const mediaType = checkIntake([file], { files: 0 })[0];
    if (!mediaType.ok) return;
    update(key, { state: "uploading", progress: 0, message: null, detail: undefined, retry: false });
    try {
      const body = await file.arrayBuffer();
      const payload = { orgId, projectId, evaluationId, title: file.name, rights: "customer_owned", visibility: "internal", mediaType: mediaType.mediaType, byteSize: file.size, sha256: hash };
      const created = await evalRequest<{ sourceId: string; uploadUrl?: string; duplicate?: boolean }>("/sources/uploads", "POST", payload, await stableKey("source-upload", payload));
      if (created.duplicate) {
        update(key, { state: "duplicate", progress: 1, message: "intakeDuplicateExisting" });
        return;
      }
      let detail = await evalRequest<SourceDetail>(`/sources/${created.sourceId}?orgId=${orgId}`);
      let revisionId = detail.revisions?.[0]?.id ?? detail.ingestion?.source_revision_id ?? null;
      if (!revisionId && detail.ingestion?.status !== "failed") {
        if (!detail.ingestion && created.uploadUrl) {
          await putWithProgress(created.uploadUrl, body, (fraction) => update(key, { progress: fraction }));
          await evalRequest(`/sources/${created.sourceId}/finalize`, "POST", { orgId }, `source-finalize-${created.sourceId}`);
        }
        update(key, { state: "reading", progress: 1 });
        for (let attempt = 0; attempt < 90 && mounted.current; attempt++) {
          detail = await evalRequest<SourceDetail>(`/sources/${created.sourceId}?orgId=${orgId}`);
          if (detail.ingestion?.status === "completed" || detail.ingestion?.status === "failed") break;
          await wait(2_000);
        }
        revisionId = detail.ingestion?.status === "completed" ? detail.ingestion.source_revision_id ?? detail.revisions?.[0]?.id ?? null : null;
      }
      if (detail.ingestion?.status === "failed") {
        // The source exists and failed: it moves to the list, where it can be left out.
        onPending({ id: created.sourceId, title: file.name, kind: "document", state: "failed", reason: detail.ingestion.reason_code });
        update(key, { state: "failed", message: detail.ingestion.reason_code === "pdf_scanned" ? "reasonPdfScanned" : "intakeErrorExtraction" });
        return;
      }
      if (!revisionId) {
        onPending({ id: created.sourceId, title: file.name, kind: "document", state: "reading", reason: null });
        update(key, { state: "reading", message: "intakeStillReading" });
        return;
      }
      known.current.add(hash);
      onReady({ id: created.sourceId, title: file.name, revisionId, chunks: detail.chunks, chunkCount: detail.chunkCount ?? detail.chunks.length, kind: "document", scan: scanInfo(detail.ingestion) });
      update(key, { state: "ready", progress: 1 });
    } catch (error) {
      // A limit the server enforces reads like the check before upload; anything else keeps the server's sentence.
      const status = error instanceof EvalRequestError ? error.status : 0;
      if (status === 413) update(key, { state: "failed", message: "intakeErrorCount", retry: false });
      else update(key, { state: "failed", message: error instanceof UploadFailure || !(error instanceof Error) ? "intakeErrorUpload" : null, detail: error instanceof UploadFailure ? undefined : error instanceof Error ? error.message : undefined, retry: true });
    }
  }, [evaluationId, onPending, onReady, orgId, projectId, update]);

  /** One upload lane: takes files from the queue until it is empty. */
  const drain = useCallback(async () => {
    while (queue.current.length) await uploadOne(queue.current.shift()!);
  }, [uploadOne]);
  /** At most two files upload at once; each keeps its own progress and outcome. */
  const pump = useCallback(() => {
    while (running.current < 2 && queue.current.length) {
      running.current++;
      void drain().finally(() => {
        running.current--;
        if (!running.current && !queue.current.length) onChanged();
      });
    }
  }, [drain, onChanged]);

  async function add(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const accepted = items.filter((item) => ["queued", "checking", "uploading", "reading"].includes(item.state)).length;
    const checks = checkIntake(picked, { files: existingFiles + accepted });
    const entries: Item[] = picked.map((file, index) => {
      const key = `f${++counter.current}`;
      files.current.set(key, file);
      const check = checks[index];
      return { key, name: file.name, size: file.size, state: check.ok ? "checking" : "failed", progress: 0, message: check.ok ? null : REJECTION[check.reason], retry: false };
    });
    setItems((current) => [...current, ...entries]);
    // Hash the accepted files, then skip copies of a file already in the batch or added before.
    const accepted2 = entries.filter((entry) => entry.state === "checking");
    const computed = await Promise.all(accepted2.map(async (entry) => {
      try { return await sha256Hex(await files.current.get(entry.key)!.arrayBuffer()); } catch { return null; }
    }));
    const batchKnown = new Set([...known.current, ...hashes.current.values()]);
    const verdicts = duplicateVerdicts(computed, batchKnown);
    accepted2.forEach((entry, index) => {
      const hash = computed[index];
      const verdict = verdicts[index];
      if (!hash) { update(entry.key, { state: "failed", message: "intakeErrorUpload", retry: false }); return; }
      if (verdict === "batch" || verdict === "known") { update(entry.key, { state: "duplicate", message: verdict === "batch" ? "intakeDuplicateInBatch" : "intakeDuplicateExisting" }); return; }
      hashes.current.set(entry.key, hash);
      update(entry.key, { state: "queued" });
      queue.current.push(entry.key);
    });
    pump();
  }

  function retry(key: string) {
    update(key, { state: "queued", message: null, detail: undefined, retry: false, progress: 0 });
    queue.current.push(key);
    pump();
  }

  const counts = useMemo(() => ({
    added: items.filter((item) => item.state === "ready").length,
    duplicates: items.filter((item) => item.state === "duplicate").length,
    failed: items.filter((item) => item.state === "failed").length,
    busy: items.some((item) => ["queued", "checking", "uploading"].includes(item.state)),
  }), [items]);

  return (
    <div className="p-drop">
      <label
        className="p-drop-zone"
        data-dragging={dragging ? "true" : undefined}
        aria-disabled={disabled || undefined}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) void add(event.dataTransfer.files); }}
      >
        <Upload aria-hidden="true" />
        <span className="p-drop-title">{dragging ? t("intakeDropActive") : t("intakeDropTitle")}</span>
        <span className="p-drop-hint">{t("intakeDropHint")}</span>
        <input ref={input} type="file" accept={INTAKE_ACCEPT} multiple disabled={disabled} onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; void add(picked); }} aria-label={t("chooseDocuments")} />
      </label>
      {items.length > 0 && (
        <div className="p-intake" aria-live="polite">
          <ul className="p-intake-list" aria-label={t("intakeQueueLabel")}>
            {items.map((item) => (
              <li key={item.key} data-state={item.state}>
                <FileText aria-hidden="true" />
                <span className="p-intake-name">
                  <span className="p-files-name">{item.name}</span>
                  <span className="p-cell-meta">{size(item.size)}{item.message ? ` · ${t(item.message)}` : item.detail ? ` · ${item.detail}` : ""}</span>
                </span>
                {item.state === "uploading" ? (
                  <span className="p-intake-progress">
                    <Progress value={Math.round(item.progress * 100)} max={100} label={`${item.name}: ${tv("intakeStatusUploading", { percent: Math.round(item.progress * 100) })}`} />
                  </span>
                ) : null}
                <IntakeBadge item={item} />
                {item.retry && (
                  <button type="button" className="p-btn" data-variant="ghost" data-shape="icon" data-size="sm" aria-label={`${t("intakeRetry")}: ${item.name}`} title={t("intakeRetry")} onClick={() => retry(item.key)}>
                    <RotateCcw aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="p-intake-foot">
            <span className="p-cell-meta" role="status">{tv("intakeSummary", { added: counts.added, duplicates: counts.duplicates, failed: counts.failed })}</span>
            {!counts.busy && (
              <Action variant="ghost" size="sm" onClick={() => setItems((current) => current.filter((item) => item.state === "reading" && !item.message))}>
                {t("intakeClear")}
              </Action>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IntakeBadge({ item }: { item: Item }) {
  switch (item.state) {
    case "queued": return <Badge tone="neutral" dot>{t("intakeStatusQueued")}</Badge>;
    case "checking": return <Badge tone="info" dot live>{t("intakeStatusChecking")}</Badge>;
    case "uploading": return <Badge tone="info" dot live>{tv("intakeStatusUploading", { percent: Math.round(item.progress * 100) })}</Badge>;
    case "reading": return <Badge tone="info" dot live>{t("intakeStatusReading")}</Badge>;
    case "ready": return <Badge tone="pass" dot>{t("intakeStatusReady")}</Badge>;
    case "duplicate": return <Badge tone="neutral" dot>{t("intakeStatusDuplicate")}</Badge>;
    default: return <Badge tone="fail" dot>{t("intakeStatusFailed")}</Badge>;
  }
}

/* ----------------------------------------------------------- scan ask --- */

export function ScanNotice({ scan, title, onLeaveOut, onUploadText, onAddPage, disabled }: {
  scan: ScanInfo;
  title: string;
  onLeaveOut: () => void;
  onUploadText: () => void;
  onAddPage: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="p-files-notice" role="note" aria-label={`${t("scanTitle")}: ${title}`}>
      <p className="p-files-notice-title"><CircleAlert aria-hidden="true" />{t("scanTitle")}</p>
      <p className="p-cell-meta">
        {t("scanAsk")}
        {scan.pages !== null && scan.chars !== null && <> {tv("scanStats", { chars: scan.chars, pages: scan.pages, empty: scan.empty ?? 0 })}.</>}
      </p>
      <div className="p-row">
        <Action variant="secondary" size="sm" onClick={onUploadText} disabled={disabled}>{t("scanUploadText")}</Action>
        <Action variant="ghost" size="sm" onClick={onAddPage} disabled={disabled}>{t("scanAddPage")}</Action>
        <Action variant="ghost" size="sm" onClick={onLeaveOut} disabled={disabled}>{t("scanLeaveOut")}</Action>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- help centre import --- */

type Preview = {
  id: string; status: "queued" | "running" | "ready" | "failed"; origin: string | null; pathPrefix: string | null;
  discoveredFrom: "sitemap" | "links" | null; pages: string[]; foundTotal: number | null; robotsExcluded: number | null; outsidePrefix: number | null;
  reasonCode: string | null; cap: number; estimate: { creditsPerPage: string };
};

const IMPORT_REASONS = new Set(["website_robots_disallowed", "website_robots_unavailable", "website_pages_not_found", "website_page_unavailable"]);

function suggestedPrefix(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (/\.xml$/i.test(url.pathname) || url.pathname === "/") return "";
    return url.pathname.replace(/\/+$/, "");
  } catch { return ""; }
}

/** Credits for n pages at a decimal per-page rate, without floating-point noise. */
function credits(pages: number, perPage: string) {
  const value = pages * Number(perPage);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function HelpCentreImport({ orgId, evaluationId, projectId, open, onOpenChange, onStarted }: {
  orgId: string;
  evaluationId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (source: IntakePending & { pages: number }) => void;
}) {
  const [url, setUrl] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<"" | "find" | "import">("");
  const [error, setError] = useState("");
  const live = useRef(0);

  useEffect(() => {
    if (open) return;
    live.current++;
    setPreview(null); setSelected(new Set()); setPending(""); setError("");
  }, [open]);

  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || pending) return;
    const token = ++live.current;
    setPending("find"); setError(""); setPreview(null);
    try {
      const sitemap = /\.xml$/i.test(new URL(url.trim()).pathname);
      const body = { orgId, evaluationId, url: url.trim(), sitemapUrl: sitemap ? url.trim() : null, pathPrefix: prefix.trim() || null };
      const created = await evalRequest<{ previewId: string }>("/sources/websites/preview", "POST", body, await stableKey("website-preview", body));
      for (let attempt = 0; attempt < 120 && live.current === token; attempt++) {
        const state = await evalRequest<Preview>(`/sources/websites/preview/${created.previewId}?orgId=${orgId}`);
        if (live.current !== token) return;
        if (state.status === "ready" || state.status === "failed") {
          setPreview(state);
          setSelected(new Set(state.pages.slice(0, state.cap)));
          return;
        }
        await wait(1_500);
      }
      if (live.current === token) setError(t("importReason_default"));
    } catch (value) {
      if (live.current === token) setError(value instanceof Error ? value.message : t("importReason_default"));
    } finally {
      if (live.current === token) setPending("");
    }
  }

  async function startImport() {
    if (!preview || !selected.size || selected.size > preview.cap || pending) return;
    setPending("import"); setError("");
    try {
      const selectedUrls = preview.pages.filter((page) => selected.has(page));
      const body = { orgId, evaluationId, projectId, previewId: preview.id, selectedUrls };
      const started = await evalRequest<{ sourceId: string; pages?: number }>("/sources/websites", "POST", body, await stableKey("website-import", body));
      const title = `${preview.origin ? new URL(preview.origin).hostname : url}${preview.pathPrefix ?? ""}`;
      onStarted({ id: started.sourceId, title, kind: "website", state: "reading", reason: null, pages: selectedUrls.length });
      notify(tv("importStarted", { count: selectedUrls.length }));
      onOpenChange(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : t("importReason_default"));
    } finally {
      setPending("");
    }
  }

  const ready = preview?.status === "ready";
  const host = preview?.origin ? new URL(preview.origin).hostname : "";
  const overCap = !!preview && selected.size > preview.cap;
  const toggle = (page: string) => setSelected((current) => { const next = new Set(current); if (next.has(page)) next.delete(page); else next.add(page); return next; });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("importHelpCentreTitle")}
      description={t("importHelpCentreHelp")}
      alert={error ? <Status error>{error}</Status> : preview?.status === "failed" ? <Status error>{t((IMPORT_REASONS.has(preview.reasonCode ?? "") ? `importReason_${preview.reasonCode}` : "importReason_default") as MessageKey)}</Status> : null}
      footer={ready ? (
        <>
          <Action variant="ghost" onClick={() => { setPreview(null); setSelected(new Set()); }} disabled={!!pending}>{t("importBack")}</Action>
          <Action onClick={() => void startImport()} disabled={!selected.size || overCap || !!pending}>
            <Globe aria-hidden="true" />
            {tv("importPages", { count: selected.size })}
          </Action>
        </>
      ) : undefined}
    >
      {!ready ? (
        <form className="p-inline-form p-import-form" onSubmit={find}>
          <Field id="import-url" type="url" inputMode="url" label={t("importUrlLabel")} placeholder="https://example.com/help" value={url} required
            onChange={(event) => { setUrl(event.target.value); if (!prefixTouched) setPrefix(suggestedPrefix(event.target.value)); }} />
          <Field id="import-prefix" label={t("importPrefixLabel")} placeholder="/help" value={prefix} hint={t("importPrefixHint")}
            onChange={(event) => { setPrefix(event.target.value); setPrefixTouched(true); }} />
          <div className="p-row">
            <Action type="submit" variant="secondary" disabled={!url.trim() || !!pending}>{pending === "find" ? t("importFinding") : t("importFindPages")}</Action>
          </div>
          {pending === "find" && <p className="p-field-hint" role="status">{t("importFindingHelp")}</p>}
        </form>
      ) : (
        <div className="p-import">
          <p className="p-import-summary">
            <strong>{tv("importFoundSummary", { found: preview.foundTotal ?? preview.pages.length, host })}</strong>
            <span className="p-cell-meta">
              {preview.discoveredFrom === "links" ? t("importFromLinks") : t("importFromSitemap")}
              {!!preview.robotsExcluded && <> {tv("importRobotsExcluded", { count: preview.robotsExcluded })}</>}
              {!!preview.outsidePrefix && !!preview.pathPrefix && <> {tv("importOutsidePrefix", { count: preview.outsidePrefix, prefix: preview.pathPrefix })}</>}
              {(preview.foundTotal ?? 0) > preview.pages.length && <> {tv("importMoreListed", { shown: preview.pages.length, found: preview.foundTotal ?? 0 })}</>}
            </span>
          </p>
          <div className="p-import-toolbar">
            <span className="p-cell-meta" role="status">{tv("importSelected", { selected: selected.size, cap: preview.cap })}</span>
            <span className="p-toolbar-spacer" />
            <Action variant="ghost" size="sm" onClick={() => setSelected(new Set(preview.pages.slice(0, preview.cap)))}>{tv("importSelectFirst", { count: Math.min(preview.cap, preview.pages.length) })}</Action>
            <Action variant="ghost" size="sm" onClick={() => setSelected(new Set())}>{t("importSelectNone")}</Action>
          </div>
          <fieldset className="p-import-list">
            <legend className="sr-only">{t("importPageList")}</legend>
            {preview.pages.map((page) => {
              const path = (() => { try { const parsed = new URL(page); return parsed.pathname || "/"; } catch { return page; } })();
              return (
                <label key={page} className="p-import-page">
                  <input type="checkbox" checked={selected.has(page)} onChange={() => toggle(page)} />
                  <span title={page}>{path}</span>
                </label>
              );
            })}
          </fieldset>
          <p className="p-import-estimate">
            {overCap ? <Status tone="warn">{tv("importOverCap", { cap: preview.cap })}</Status> : null}
            <span>{tv("importEstimate", { pages: selected.size, credits: credits(selected.size, preview.estimate.creditsPerPage), perPage: preview.estimate.creditsPerPage })}</span>
            <span className="p-cell-meta">{t("importEstimateNote")} {tv("importCapHelp", { cap: preview.cap })}</span>
          </p>
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------- context confirmation --- */

type FieldView = { confidence: number; low: boolean; excerpts: Array<{ sourceTitle: string; text: string }> };
type ContextView = {
  profileRevisionId: string;
  purpose: FieldView & { value: string | null };
  intendedUsers: FieldView & { values: string[] };
  tasks: FieldView & { values: string[] };
  languages: FieldView & { values: string[] };
  jurisdiction: FieldView & { value: string | null };
  asOf: FieldView & { value: string | null };
  boundaries: FieldView & { values: string[] };
  sources: Array<{ revisionId: string; title: string; rank: number }>;
  conflicts: Array<{ field: string; values: string[]; sources: string[] }>;
  openQuestions: Array<{ field: string; question: string; critical: boolean }>;
};
type ConfirmationState = { confirmation: { id: string; jobId: string; status: string; dueAt: string | null; editedFields: string[] } | null; context: ContextView | null };

type EditKey = "purpose" | "intendedUsers" | "tasks" | "languages" | "jurisdiction" | "asOf" | "boundaries" | "primarySource";
const FIELD_LABEL: Record<string, MessageKey> = {
  purpose: "ctxPurpose", intended_users: "ctxUsers", tasks: "ctxTasks", languages: "ctxLanguages", jurisdiction: "ctxJurisdiction",
  as_of: "ctxAsOf", business_boundaries: "ctxBoundaries", source_hierarchy: "ctxSources",
};

function ExcerptToggle({ id, excerpts }: { id: string; excerpts: FieldView["excerpts"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-ctx-evidence">
      <button type="button" className="p-link-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        {open ? t("ctxHideSources") : t("ctxShowSources")}
      </button>
      {open && (
        <div id={id} className="p-ctx-excerpts">
          {excerpts.length ? excerpts.map((excerpt, index) => (
            <blockquote key={index} className="p-ctx-excerpt">
              {excerpt.sourceTitle === "detected_from_sources" ? t("ctxDetectedLanguage") : excerpt.text}
              <footer className="p-cell-meta">{excerpt.sourceTitle === "project_description" ? t("ctxFromDescription") : excerpt.sourceTitle === "detected_from_sources" ? "" : excerpt.sourceTitle}</footer>
            </blockquote>
          )) : <p className="p-cell-meta">{t("ctxNoExcerpt")}</p>}
        </div>
      )}
    </div>
  );
}

function ContextRow({ id, label, field, edited, editing, onEdit, children, editor }: {
  id: string; label: string; field?: FieldView; edited: boolean; editing: boolean; onEdit?: () => void; children: React.ReactNode; editor?: React.ReactNode;
}) {
  return (
    <div className="p-ctx-row" data-low={field?.low && !edited ? "true" : undefined}>
      <div className="p-ctx-label">
        <span id={`${id}-label`}>{label}</span>
        {edited ? <Badge tone="info" dot>{t("ctxEdited")}</Badge> : field?.low ? <Badge tone="warn" dot>{t("ctxCheck")}</Badge> : null}
      </div>
      <div className="p-ctx-value">
        {editing ? editor : children}
        {field && !editing && field.excerpts.length > 0 && <ExcerptToggle id={`${id}-sources`} excerpts={field.excerpts} />}
      </div>
      {onEdit && (
        <div className="p-ctx-action">
          <Action variant="ghost" size="sm" onClick={onEdit} aria-describedby={`${id}-label`}>
            {editing ? t("ctxDone") : <><Pencil aria-hidden="true" />{t("ctxEdit")}</>}
          </Action>
        </div>
      )}
    </div>
  );
}

const listText = (values: string[]) => values.join("\n");
/** "es" → "Spanish" (or "español"), in the interface language; the tag itself when unknown. */
function languageName(tag: string) {
  try { return new Intl.DisplayNames([getLocale()], { type: "language" }).of(tag) ?? tag; } catch { return tag; }
}
const listValues = (text: string) => text.split("\n").map((value) => value.trim()).filter(Boolean);

export function ContextConfirmation({ orgId, evaluationId, jobId, canWrite, onDecided }: {
  orgId: string;
  evaluationId: string;
  jobId: string;
  canWrite: boolean;
  onDecided: (decision: "confirmed" | "skipped") => void;
}) {
  const [state, setState] = useState<ConfirmationState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<Partial<Record<EditKey, string>>>({});
  const [pending, setPending] = useState<"" | "confirm" | "skip">("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    evalRequest<ConfirmationState>(`/evaluations/${evaluationId}/context/confirmation?orgId=${orgId}&jobId=${jobId}`)
      .then((value) => { if (live) setState(value); })
      .catch((value) => { if (live) setLoadError(value instanceof Error ? value.message : t("ctxLoadFailed")); });
    return () => { live = false; };
  }, [evaluationId, jobId, orgId]);

  if (loadError) return <Status error>{loadError}</Status>;
  if (!state?.context || !state.confirmation) return <p className="p-cell-meta" role="status">{t("ctxLoading")}</p>;
  const context = state.context;
  const confirmation = state.confirmation;

  const original: Record<EditKey, string> = {
    purpose: context.purpose.value ?? "",
    intendedUsers: listText(context.intendedUsers.values),
    tasks: listText(context.tasks.values),
    languages: context.languages.values.join(", "),
    jurisdiction: context.jurisdiction.value ?? "",
    asOf: context.asOf.value ?? "",
    boundaries: listText(context.boundaries.values),
    primarySource: context.sources[0]?.revisionId ?? "",
  };
  const value = (key: EditKey) => draft[key] ?? original[key];
  const changed = (key: EditKey) => draft[key] !== undefined && draft[key]!.trim() !== original[key].trim();
  const toggle = (key: EditKey) => setEditing((current) => (current === key ? null : key));
  const set = (key: EditKey) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const decided = confirmation.status === "confirmed" || confirmation.status === "skipped";
  const editable = canWrite && confirmation.status === "pending" && !pending;

  async function decide(decision: "confirm" | "skip") {
    if (!editable) return;
    setPending(decision); setError("");
    try {
      const edits: Record<string, unknown> = {};
      if (decision === "confirm") {
        if (changed("purpose") && value("purpose").trim()) edits.purpose = value("purpose").trim();
        if (changed("intendedUsers")) edits.intendedUsers = listValues(value("intendedUsers"));
        if (changed("tasks")) edits.tasks = listValues(value("tasks"));
        if (changed("languages")) edits.languages = value("languages").split(",").map((item) => item.trim()).filter(Boolean);
        if (changed("jurisdiction")) edits.jurisdiction = value("jurisdiction").trim() || null;
        if (changed("asOf")) edits.asOf = value("asOf").trim() || null;
        if (changed("boundaries")) edits.boundaries = listValues(value("boundaries"));
        if (changed("primarySource")) edits.primarySourceRevisionId = value("primarySource");
      }
      const body = { orgId, jobId, decision, ...(decision === "confirm" ? { edits } : {}) };
      await evalRequest(`/evaluations/${evaluationId}/context/confirmation`, "POST", body, await stableKey(`context-confirmation-${jobId}`, body));
      notify(decision === "confirm" ? t("ctxConfirmedNote") : t("ctxSkippedNote"));
      onDecided(decision === "confirm" ? "confirmed" : "skipped");
    } catch (value) {
      setError(value instanceof Error ? value.message : t("ctxSaveFailed"));
      setPending("");
    }
  }

  const list = (values: string[]) => values.length ? <ul className="p-ctx-list">{values.map((item, index) => <li key={index}>{item}</li>)}</ul> : <span className="p-cell-meta">{t("ctxNotStated")}</span>;
  const text = (item: string | null) => item ? <span>{item}</span> : <span className="p-cell-meta">{t("ctxNotStated")}</span>;
  const due = confirmation.dueAt ? new Date(confirmation.dueAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  const edit = (key: EditKey) => (editable ? () => toggle(key) : undefined);

  return (
    <section className="p-ctx" aria-labelledby="ctx-title">
      <div className="p-ctx-head">
        <h3 id="ctx-title" className="p-ctx-title">{t("ctxTitle")}</h3>
        <p className="p-cell-meta">{t("ctxIntro")}</p>
        {due && !decided && <p className="p-field-hint">{tv("ctxDue", { time: due })}</p>}
      </div>
      {error && <Status error>{error}</Status>}
      <div className="p-ctx-rows">
        <ContextRow id="ctx-purpose" label={t("ctxPurpose")} field={context.purpose} edited={changed("purpose")} editing={editing === "purpose"} onEdit={edit("purpose")}
          editor={<TextArea id="ctx-purpose-input" label={t("ctxPurpose")} rows={3} value={value("purpose")} onChange={set("purpose")} />}>
          {text(changed("purpose") ? value("purpose") : context.purpose.value)}
        </ContextRow>
        <ContextRow id="ctx-users" label={t("ctxUsers")} field={context.intendedUsers} edited={changed("intendedUsers")} editing={editing === "intendedUsers"} onEdit={edit("intendedUsers")}
          editor={<TextArea id="ctx-users-input" label={t("ctxUsers")} hint={t("ctxOnePerLine")} rows={3} value={value("intendedUsers")} onChange={set("intendedUsers")} />}>
          {list(changed("intendedUsers") ? listValues(value("intendedUsers")) : context.intendedUsers.values)}
        </ContextRow>
        <ContextRow id="ctx-tasks" label={t("ctxTasks")} field={context.tasks} edited={changed("tasks")} editing={editing === "tasks"} onEdit={edit("tasks")}
          editor={<TextArea id="ctx-tasks-input" label={t("ctxTasks")} hint={t("ctxOnePerLine")} rows={4} value={value("tasks")} onChange={set("tasks")} />}>
          {list(changed("tasks") ? listValues(value("tasks")) : context.tasks.values)}
        </ContextRow>
        <ContextRow id="ctx-languages" label={t("ctxLanguages")} field={context.languages} edited={changed("languages")} editing={editing === "languages"} onEdit={edit("languages")}
          editor={<Field id="ctx-languages-input" label={t("ctxLanguages")} hint={t("ctxLanguagesHint")} value={value("languages")} onChange={set("languages")} />}>
          {text(changed("languages") ? value("languages") : context.languages.values.map(languageName).join(", ") || null)}
        </ContextRow>
        <ContextRow id="ctx-jurisdiction" label={t("ctxJurisdiction")} field={context.jurisdiction} edited={changed("jurisdiction")} editing={editing === "jurisdiction"} onEdit={edit("jurisdiction")}
          editor={<Field id="ctx-jurisdiction-input" label={t("ctxJurisdiction")} value={value("jurisdiction")} onChange={set("jurisdiction")} />}>
          {text(changed("jurisdiction") ? value("jurisdiction") || null : context.jurisdiction.value)}
        </ContextRow>
        <ContextRow id="ctx-asof" label={t("ctxAsOf")} field={context.asOf} edited={changed("asOf")} editing={editing === "asOf"} onEdit={edit("asOf")}
          editor={<Field id="ctx-asof-input" type="date" label={t("ctxAsOf")} hint={t("ctxAsOfHint")} value={value("asOf")} onChange={set("asOf")} />}>
          {text(changed("asOf") ? value("asOf") || null : context.asOf.value)}
        </ContextRow>
        <ContextRow id="ctx-sources" label={t("ctxSources")} edited={changed("primarySource")} editing={editing === "primarySource"} onEdit={context.sources.length > 1 ? edit("primarySource") : undefined}
          editor={<SelectField id="ctx-sources-input" label={t("ctxPrimarySource")} value={value("primarySource")} onChange={set("primarySource")}>
            {context.sources.map((source) => <option key={source.revisionId} value={source.revisionId}>{source.title}</option>)}
          </SelectField>}>
          <p className="p-cell-meta">{t("ctxSourcesHelp")}</p>
          <ol className="p-ctx-list">
            {(changed("primarySource")
              ? [...context.sources.filter((source) => source.revisionId === value("primarySource")), ...context.sources.filter((source) => source.revisionId !== value("primarySource"))]
              : context.sources).map((source) => <li key={source.revisionId}>{source.title}</li>)}
          </ol>
          {context.conflicts.length > 0 && (
            <div className="p-ctx-conflicts">
              <p className="p-cell-meta">{t("ctxConflicts")}</p>
              <ul className="p-ctx-list">
                {context.conflicts.map((conflict, index) => (
                  <li key={index}>{FIELD_LABEL[conflict.field] ? t(FIELD_LABEL[conflict.field]) : conflict.field}: {conflict.values.join(" · ")} ({conflict.sources.join(", ")})</li>
                ))}
              </ul>
            </div>
          )}
        </ContextRow>
        <ContextRow id="ctx-boundaries" label={t("ctxBoundaries")} field={context.boundaries} edited={changed("boundaries")} editing={editing === "boundaries"} onEdit={edit("boundaries")}
          editor={<TextArea id="ctx-boundaries-input" label={t("ctxBoundaries")} hint={t("ctxOnePerLine")} rows={3} value={value("boundaries")} onChange={set("boundaries")} />}>
          {(changed("boundaries") ? listValues(value("boundaries")) : context.boundaries.values).length
            ? list(changed("boundaries") ? listValues(value("boundaries")) : context.boundaries.values)
            : <span className="p-cell-meta">{t("ctxNone")}</span>}
        </ContextRow>
        {context.openQuestions.length > 0 && (
          <ContextRow id="ctx-questions" label={t("ctxOpenQuestions")} edited={false} editing={false}>
            <ul className="p-ctx-list">
              {context.openQuestions.map((question, index) => <li key={index}>{question.question}</li>)}
            </ul>
          </ContextRow>
        )}
      </div>
      {canWrite && !decided && (
        <div className="p-ctx-foot">
          <Action onClick={() => void decide("confirm")} disabled={!editable}>{pending === "confirm" ? t("preparing") : t("ctxConfirm")}</Action>
          <Action variant="secondary" onClick={() => void decide("skip")} disabled={!editable}>{t("ctxSkip")}</Action>
          <p className="p-field-hint">{t("ctxSkipHelp")}</p>
        </div>
      )}
    </section>
  );
}
