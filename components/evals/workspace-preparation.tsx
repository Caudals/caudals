"use client";

/**
 * Preparation: reference material → generated test set → review → approve.
 *
 * The backend pipeline (extraction, context profiling, DGX drafting, source
 * validation) is shown only as three plain-language stages that mirror real
 * job states. Every request keeps its idempotency key, so reloading the page
 * or retrying a step never duplicates work.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Globe, Plus, Sparkles, Upload, X } from "lucide-react";
import { generationStartIdempotencyKey } from "@/lib/evals/domain/generation-idempotency";
import { evalRequest } from "./api";
import { Action, Badge, Field, Progress, SectionHeading, SelectField, Status, TextArea } from "./primitives";
import { notify } from "./overlays";
import { DeleteDialog, itemRequest } from "./item-actions";
import { ContextQuestionsForm, ExcerptBrowser, ScopePicker, TestSetReview, type CasePreview, type Complexity, type ContextQuestion } from "./preparation-parts";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/en";

type Evaluation = {
  id: string;
  title: string;
  project_id: string;
  project_description: string;
  latest_source_id: string | null;
  latest_source_revision_id: string | null;
  source_ids?: string[];
  preparation_status: string;
};
type SourceDetail = {
  title?: string;
  chunks: Array<{ id: string; excerpt: string }>;
  chunkCount?: number;
  revisions?: Array<{ id: string }>;
  ingestion?: { status: string; source_revision_id: string | null; reason_code: string | null } | null;
  websiteCapture?: { id: string; start_url: string; status: string; reason_code: string | null; source_revision_id: string | null } | null;
};
type PreparedSource = { id: string; title: string; revisionId: string; chunks: SourceDetail["chunks"]; chunkCount: number; kind: "document" | "website" };
/** Material that is still being read (a website capture or document extraction), or that failed. */
type PendingSource = { id: string; title: string; kind: "document" | "website"; state: "reading" | "failed"; reason: string | null };

/** Ready, still reading, or failed — from one source detail. */
function sourceState(id: string, detail: SourceDetail, fallbackRevision: string | null): { ready: PreparedSource } | { pending: PendingSource } {
  const kind = detail.websiteCapture ? "website" : "document";
  const title = detail.title ?? (detail.websiteCapture?.start_url || t("document"));
  // The newest revision wins, so edited excerpts are what the next test set uses.
  const revisionId = detail.websiteCapture
    ? (detail.websiteCapture.status === "completed" && detail.ingestion?.status === "completed" ? detail.revisions?.[0]?.id ?? detail.websiteCapture.source_revision_id ?? detail.ingestion.source_revision_id : null)
    : detail.revisions?.[0]?.id ?? detail.ingestion?.source_revision_id ?? fallbackRevision;
  if (revisionId) return { ready: { id, title, revisionId, chunks: detail.chunks, chunkCount: detail.chunkCount ?? detail.chunks.length, kind } };
  const failed = detail.websiteCapture?.status === "failed" || detail.ingestion?.status === "failed";
  return { pending: { id, title, kind, state: failed ? "failed" : "reading", reason: detail.websiteCapture?.reason_code ?? detail.ingestion?.reason_code ?? null } };
}
type Draft = { suiteId: string; suiteVersionId: string; suiteDraftVersion: number };
type GenerationProgress = { written: number; target: number };
type GenerationStatus = "profiling" | "profile_ready" | "drafting" | "draft_ready" | "needs_input" | "needs_review" | "paused" | "quarantined" | "failed" | string;

const ACCEPT = ".txt,.md,.docx,.pdf,.csv,.xlsx";
const MEDIA: Record<string, string> = {
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Paused because the model ran out of output allowance; the server can retry once without reasoning. */
const OUTPUT_RETRY_REASONS = new Set(["generation_output_exhausted", "incomplete_response"]);

async function stableKey(action: string, payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `${action}-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);

/** The three stages a customer sees for the internal generation pipeline. */
function generationStage(status: GenerationStatus | null): 0 | 1 | 2 {
  if (status === "profiling" || status === "profile_ready" || status === "needs_input") return 0;
  if (status === "drafting") return 1;
  return 2;
}

export function PrepareEvaluation({
  orgId,
  evaluation,
  executionMode = "deployed_system",
  onReady,
}: {
  orgId: string;
  evaluation: Evaluation;
  executionMode?: "deployed_system" | "imported_responses";
  onReady: () => Promise<void>;
}) {
  const [sources, setSources] = useState<PreparedSource[]>([]);
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([]);
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [casePreviews, setCasePreviews] = useState<CasePreview[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [showWebsite, setShowWebsite] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteRights, setWebsiteRights] = useState<"customer_owned" | "licensed" | "public_domain" | "">("");
  const [pending, setPending] = useState<"" | "upload" | "website" | "generate" | "manual" | "context" | "approve">("");
  const [error, setError] = useState("");
  const [autoJobId, setAutoJobId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationStatus | null>(null);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [contextQuestions, setContextQuestions] = useState<ContextQuestion[]>([]);
  const [contextError, setContextError] = useState("");
  const [scopeSize, setScopeSize] = useState(25);
  const [complexity, setComplexity] = useState<Complexity>("balanced");
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [excerptSource, setExcerptSource] = useState<PreparedSource | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [purpose, setPurpose] = useState(evaluation.project_description);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [anchor, setAnchor] = useState("");
  const [manualSource, setManualSource] = useState("");
  const autoResumeRef = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const source = sources.find((item) => item.id === manualSource) ?? sources[0] ?? null;

  /* --------------------------------------------------------- sources --- */

  useEffect(() => {
    const sourceIds = evaluation.source_ids?.length
      ? evaluation.source_ids
      : evaluation.latest_source_id
        ? [evaluation.latest_source_id]
        : [];
    if (!sourceIds.length) {
      setSourcesLoading(false);
      return;
    }
    let live = true;
    void Promise.all(
      sourceIds.map(async (id) =>
        sourceState(id, await evalRequest<SourceDetail>(`/sources/${id}?orgId=${orgId}`), id === evaluation.latest_source_id ? evaluation.latest_source_revision_id : null)),
    )
      .then((items) => {
        if (!live) return;
        const prepared = items.flatMap((item) => ("ready" in item ? [item.ready] : []));
        setSources(prepared);
        setPendingSources(items.flatMap((item) => ("pending" in item ? [item.pending] : [])));
        setAnchor((current) => current || prepared[0]?.chunks[0]?.id || "");
      })
      .catch(() => {
        if (live) setError(t("sourcesLoadError"));
      })
      .finally(() => {
        if (live) setSourcesLoading(false);
      });
    return () => {
      live = false;
    };
  }, [evaluation.id, evaluation.source_ids, evaluation.latest_source_id, evaluation.latest_source_revision_id, orgId]);

  // Websites and large documents keep reading in the background, even after a reload.
  const reading = pendingSources.filter((item) => item.state === "reading").map((item) => item.id).join(",");
  useEffect(() => {
    if (!reading) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      for (const id of reading.split(",")) {
        try {
          const state = sourceState(id, await evalRequest<SourceDetail>(`/sources/${id}?orgId=${orgId}`), null);
          if (!live) return;
          if ("ready" in state) {
            setPendingSources((current) => current.filter((item) => item.id !== id));
            remember(state.ready);
            void onReady();
          } else if (state.pending.state === "failed") {
            setPendingSources((current) => current.map((item) => (item.id === id ? state.pending : item)));
          }
        } catch {
          /* try again on the next tick */
        }
      }
      // A fresh array identity re-arms this effect for the next tick.
      if (live) setPendingSources((current) => [...current]);
    }, 3_000);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, orgId, pendingSources]);

  async function removeSource(id: string) {
    await itemRequest("sources", id, orgId, "DELETE");
    setSources((current) => current.filter((item) => item.id !== id));
    setPendingSources((current) => current.filter((item) => item.id !== id));
    setAnchor("");
    await onReady();
  }

  function remember(item: PreparedSource) {
    setSources((current) => {
      const next = [...current.filter((existing) => existing.id !== item.id), item];
      setAnchor((value) => value || next[0]?.chunks[0]?.id || "");
      return next;
    });
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || pending) return;
    setPending("upload");
    setError("");
    try {
      if (
        sources.filter((item) => item.kind === "document").length + files.length > 20 ||
        files.some((item) => item.size < 1 || item.size > 25_000_000) ||
        files.reduce((sum, item) => sum + item.size, 0) > 100_000_000
      ) {
        throw new Error(t("uploadLimits"));
      }
      for (const file of files) {
        const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
        const mediaType = MEDIA[extension];
        if (!mediaType) throw new Error(t("uploadTypes"));
        const bytes = await file.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const uploadInput = { orgId, projectId: evaluation.project_id, evaluationId: evaluation.id, title: file.name, rights: "customer_owned", visibility: "internal", mediaType, byteSize: file.size, sha256: hash };
        const created = await evalRequest<{ sourceId: string; uploadUrl: string }>("/sources/uploads", "POST", uploadInput, await stableKey("source-upload", uploadInput));
        let detail = await evalRequest<SourceDetail>(`/sources/${created.sourceId}?orgId=${orgId}`);
        let revisionId = detail.revisions?.[0]?.id ?? detail.ingestion?.source_revision_id ?? null;
        if (!revisionId) {
          const uploaded = await fetch(created.uploadUrl, { method: "PUT", body: bytes, credentials: "same-origin", cache: "no-store" });
          if (!uploaded.ok) throw new Error(t("uploadIncomplete"));
          await evalRequest(`/sources/${created.sourceId}/finalize`, "POST", { orgId }, `source-finalize-${created.sourceId}`);
          for (let attempt = 0; attempt < 150; attempt++) {
            detail = await evalRequest<SourceDetail>(`/sources/${created.sourceId}?orgId=${orgId}`);
            if (detail.ingestion?.status === "completed") {
              revisionId = detail.ingestion.source_revision_id ?? detail.revisions?.[0]?.id ?? null;
              break;
            }
            if (detail.ingestion?.status === "failed") throw new Error(t("extractionFailed"));
            await wait(2_000);
          }
          if (!revisionId) throw new Error(t("extractionStillRunning"));
        }
        remember({ id: created.sourceId, title: file.name, revisionId, chunks: detail.chunks, chunkCount: detail.chunkCount ?? detail.chunks.length, kind: "document" });
      }
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      await onReady();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("uploadFailed"));
    } finally {
      setPending("");
    }
  }

  async function addWebsite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!websiteUrl.trim() || !websiteRights || pending) return;
    setPending("website");
    setError("");
    try {
      const input = { orgId, evaluationId: evaluation.id, projectId: evaluation.project_id, url: websiteUrl.trim(), rights: websiteRights };
      const started = await evalRequest<{ sourceId: string; jobId: string }>("/sources/websites", "POST", input, await stableKey("website-source", input));
      // Reading continues in the background; the list shows its progress.
      setPendingSources((current) => [...current.filter((item) => item.id !== started.sourceId), { id: started.sourceId, title: websiteUrl.trim(), kind: "website", state: "reading", reason: null }]);
      notify(t("websiteReadingStarted"));
      setWebsiteUrl("");
      setShowWebsite(false);
      void onReady();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("websiteCaptureFailed"));
    } finally {
      setPending("");
    }
  }

  /* ------------------------------------------------------ generation --- */

  const continueAutomaticGeneration = useCallback(
    async (jobId: string) => {
      if (autoResumeRef.current === jobId) return;
      autoResumeRef.current = jobId;
      setAutoJobId(jobId);
      setPending("generate");
      setError("");
      try {
        // Large sets are drafted in rounds; allow about an hour before handing back.
        for (let attempt = 0; attempt < 1800; attempt++) {
          const state = await evalRequest<{ status: GenerationStatus; job: { id: string; reasonCode?: string | null; suiteId?: string | null; suiteVersionId?: string | null; progress?: GenerationProgress } | null }>(
            `/evaluations/${evaluation.id}/generate?orgId=${orgId}&jobId=${jobId}`,
          );
          setGeneration(state.status);
          setStopReason(state.job?.reasonCode ?? null);
          if (state.job?.progress) setProgress(state.job.progress);
          if (state.status === "needs_review") {
            const review = await evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`);
            if (review.draft) {
              setDraft(review.draft);
              setCasePreviews(review.casePreviews ?? []);
              await onReady();
              return;
            }
          } else if (state.status === "profile_ready") {
            await evalRequest(`/evaluations/${evaluation.id}/generate/advance`, "POST", { orgId, jobId }, `auto-profile-${jobId}`);
          } else if (state.status === "draft_ready") {
            const prepared = await evalRequest<{ status: string; suiteId?: string; suiteVersionId?: string; suiteDraftVersion?: number }>(
              `/evaluations/${evaluation.id}/generate/advance`,
              "POST",
              { orgId, jobId },
              `auto-draft-${jobId}`,
            );
            if (prepared.status === "needs_review" && prepared.suiteId && prepared.suiteVersionId) {
              const review = await evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`);
              setDraft(review.draft ?? { suiteId: prepared.suiteId, suiteVersionId: prepared.suiteVersionId, suiteDraftVersion: prepared.suiteDraftVersion ?? 1 });
              setCasePreviews(review.casePreviews ?? []);
              await onReady();
              return;
            }
            if (prepared.status === "quarantined") {
              setGeneration("quarantined");
              setStopReason((prepared as { reasonCode?: string }).reasonCode ?? null);
              return;
            }
          } else if (state.status === "needs_input") {
            const context = await evalRequest<{ questions: ContextQuestion[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`);
            const questions = (context.questions ?? []).filter((item) => !item.jobId || item.jobId === jobId);
            setContextQuestions(questions);
            if (questions.some((item) => item.critical && item.status === "open")) return;
            await evalRequest(`/evaluations/${evaluation.id}/generate/advance`, "POST", { orgId, jobId }, `auto-context-${jobId}`);
          } else if (state.status === "paused" && state.job?.reasonCode === "invocation_configuration_invalid") {
            const resumed = await evalRequest<{ status: string }>(`/evaluations/${evaluation.id}/generate/advance`, "POST", { orgId, jobId }, `auto-config-retry-${jobId}`);
            if (resumed.status !== "drafting") throw new Error(t("generationPausedForReview"));
          } else if (state.status === "paused" && OUTPUT_RETRY_REASONS.has(state.job?.reasonCode ?? "")) {
            // The server retries once with reasoning off; a second stop stays paused.
            const resumed = await evalRequest<{ status: string; suiteId?: string; suiteVersionId?: string; suiteDraftVersion?: number }>(`/evaluations/${evaluation.id}/generate/advance`, "POST", { orgId, jobId }, `auto-output-retry-${jobId}`);
            // A later round that ran out of room finishes with the tests already written.
            if (resumed.status === "needs_review" && resumed.suiteId && resumed.suiteVersionId) {
              const review = await evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`);
              setDraft(review.draft ?? { suiteId: resumed.suiteId, suiteVersionId: resumed.suiteVersionId, suiteDraftVersion: resumed.suiteDraftVersion ?? 1 });
              setCasePreviews(review.casePreviews ?? []);
              await onReady();
              return;
            }
            if (!["profiling", "drafting"].includes(resumed.status)) return;
          } else if (state.status === "paused") {
            // A dispatched call may still have run. Show its saved reason; do
            // not suggest that polling or a page reload will replay it.
            return;
          } else if (["quarantined", "failed"].includes(state.status)) {
            // The stopped panel explains why, from the job's reason code.
            return;
          }
          await wait(2000);
        }
        throw new Error(t("generationStillRunning"));
      } catch (value) {
        setError(value instanceof Error ? value.message : t("generationFailed"));
      } finally {
        autoResumeRef.current = null;
        setPending("");
      }
    },
    [evaluation.id, orgId, onReady],
  );

  // Resume saved preparation after a reload or on another device.
  useEffect(() => {
    if (!["needs_review", "profiling", "generating", "needs_input", "validating"].includes(evaluation.preparation_status)) return;
    let live = true;
    void Promise.all([
      evalRequest<{ draft: Draft | null; casePreviews: CasePreview[]; questions: ContextQuestion[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`),
      evalRequest<{ status: GenerationStatus; job: { id: string; reasonCode?: string | null; progress?: GenerationProgress } | null }>(`/evaluations/${evaluation.id}/generate?orgId=${orgId}`),
    ])
      .then(([context, state]) => {
        if (!live) return;
        setContextQuestions((context.questions ?? []).filter((item) => !state.job || !item.jobId || item.jobId === state.job.id));
        if (state.job?.progress) setProgress(state.job.progress);
        if (context.draft) {
          setDraft(context.draft);
          setCasePreviews(context.casePreviews ?? []);
        }
        if (!state.job) return;
        setAutoJobId(state.job.id);
        setGeneration(state.status);
        setStopReason(state.job.reasonCode ?? null);
        if (state.status === "needs_input") return;
        if (
          ["profiling", "profile_ready", "drafting", "draft_ready"].includes(state.status) ||
          (state.status === "paused" && (state.job.reasonCode === "invocation_configuration_invalid" || OUTPUT_RETRY_REASONS.has(state.job.reasonCode ?? "")))
        ) {
          void continueAutomaticGeneration(state.job.id);
        }
      })
      .catch(() => {
        if (live) setError(t("preparationResumeFailed"));
      });
    return () => {
      live = false;
    };
  }, [continueAutomaticGeneration, evaluation.id, evaluation.preparation_status, orgId]);

  async function generateAutomatically() {
    if (!sources.length || pending) return;
    setPending("generate");
    setError("");
    try {
      const sourceRevisionIds = sources.map((item) => item.revisionId);
      const input = { mode: "automatic", orgId, sourceRevisionIds, title: `${evaluation.title} test set`, executionMode, promptRevision: "dgx-context-cases-v5", maxCases: scopeSize, complexity, locale: getLocale() };
      const previous = await evalRequest<{ status: GenerationStatus; job: { id: string; reasonCode?: string | null } | null }>(`/evaluations/${evaluation.id}/generate?orgId=${orgId}`);
      if (previous.job && ["profiling", "profile_ready", "drafting", "draft_ready", "needs_input"].includes(previous.status)) {
        setPending("");
        await continueAutomaticGeneration(previous.job.id);
        return;
      }
      if (previous.status === "paused" && ["network_unavailable", "worker_lease_expired"].includes(previous.job?.reasonCode ?? "") && !window.confirm(t("generationUnknownRetryConfirm"))) {
        setPending("");
        return;
      }
      const stableRequestKey = await stableKey("evaluation-auto-generation", input);
      const idempotencyKey = generationStartIdempotencyKey(stableRequestKey, { status: previous.status, jobId: previous.job?.id ?? null });
      const started = await evalRequest<{ jobId: string }>(`/evaluations/${evaluation.id}/generate`, "POST", input, idempotencyKey);
      setGeneration("profiling");
      setProgress({ written: 0, target: scopeSize });
      setContextQuestions([]);
      setPending("");
      void onReady();
      await continueAutomaticGeneration(started.jobId);
    } catch (value) {
      setError(value instanceof Error ? value.message : t("generationFailed"));
      setPending("");
    }
  }

  async function submitContext(answers: Array<{ questionId: string; answer: string | null }>) {
    if (!autoJobId || pending) return;
    setPending("context");
    setContextError("");
    try {
      await evalRequest(`/evaluations/${evaluation.id}/context/answers`, "POST", { orgId, jobId: autoJobId, answers }, await stableKey(`context-answers-${autoJobId}`, answers));
      setContextQuestions((current) => current.map((item) => (answers.some((answered) => answered.questionId === item.id) ? { ...item, status: "answered" } : item)));
      setPending("");
      await continueAutomaticGeneration(autoJobId);
    } catch (value) {
      setContextError(value instanceof Error ? value.message : t("contextSaveFailed"));
      setPending("");
    }
  }

  /** Stop a large set that halted part-way and keep the tests already written and checked. */
  async function keepPartial() {
    if (!autoJobId || pending) return;
    setPending("generate");
    setError("");
    try {
      const prepared = await evalRequest<{ status: string; suiteId?: string; suiteVersionId?: string; suiteDraftVersion?: number }>(`/evaluations/${evaluation.id}/generate/advance`, "POST", { orgId, jobId: autoJobId, finishPartial: true }, `auto-partial-${autoJobId}`);
      if (prepared.status === "needs_review" && prepared.suiteId && prepared.suiteVersionId) {
        const review = await evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`);
        setDraft(review.draft ?? { suiteId: prepared.suiteId, suiteVersionId: prepared.suiteVersionId, suiteDraftVersion: prepared.suiteDraftVersion ?? 1 });
        setCasePreviews(review.casePreviews ?? []);
        await onReady();
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : t("generationFailed"));
    } finally {
      setPending("");
    }
  }

  async function prepareManually(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || !anchor || pending) return;
    setPending("manual");
    setError("");
    try {
      const contextInput = { orgId, purpose, tasks: [question], languages: ["en"], asOf: new Date(`${asOf}T00:00:00.000Z`).toISOString(), sources: [{ revisionId: source.revisionId, authority: "customer_supplied" }], promptRevision: "customer-context-v1" };
      const context = await evalRequest<{ status: string }>(`/evaluations/${evaluation.id}/context`, "POST", contextInput, await stableKey("evaluation-context", contextInput));
      if (context.status === "needs_input") throw new Error(t("manualNeedsInput"));
      const generationInput = { orgId, sourceRevisionId: source.revisionId, title: `${evaluation.title} test set`, executionMode, questions: [{ question, expected, anchor }], promptRevision: "customer-example-v1" };
      const prepared = await evalRequest<Draft & { status: string }>(`/evaluations/${evaluation.id}/generate`, "POST", generationInput, await stableKey("evaluation-generate", generationInput));
      if (prepared.status !== "needs_review") throw new Error(t("manualNeedsReview"));
      setDraft(prepared);
      setCasePreviews([{ caseRevisionId: prepared.suiteVersionId, question, approvedAnswer: expected, sourceExcerpt: source.chunks.find((chunk) => chunk.id === anchor)?.excerpt ?? null }]);
      await onReady();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("manualFailed"));
    } finally {
      setPending("");
    }
  }

  async function approve(draftVersion: number | null, count: number) {
    if (!draft || pending || !count) return;
    setPending("approve");
    setError("");
    try {
      // The test set may have been edited since this page loaded: freeze its current draft and approve that version.
      const current = await evalRequest<{ draft: Draft | null }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`).then((value) => value.draft ?? draft).catch(() => draft);
      const version = draftVersion ?? current.suiteDraftVersion;
      const frozen = await evalRequest<{ id: string }>(`/suites/${current.suiteId}/versions`, "POST", { orgId, version }, `suite-freeze-${current.suiteId}-${version}`);
      const suiteVersionId = frozen?.id ?? current.suiteVersionId;
      await evalRequest(`/evaluations/${evaluation.id}/approve-suite`, "POST", { orgId, suiteVersionId }, `suite-approve-${evaluation.id}-${suiteVersionId}`);
      await onReady();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("approveFailed"));
    } finally {
      setPending("");
    }
  }

  /* ------------------------------------------------------------ view --- */

  const openQuestions = contextQuestions.filter((item) => item.critical && item.status === "open" && (!autoJobId || !item.jobId || item.jobId === autoJobId));
  const stopped = generation === "quarantined" || generation === "failed" || generation === "paused";
  const generating = pending === "generate" || (!!autoJobId && !draft && !openQuestions.length && ["profiling", "profile_ready", "drafting", "draft_ready"].includes(generation ?? ""));
  const stage = generationStage(generation);
  const stages = [t("stageUnderstanding"), t("stagePreparingQuestions"), t("stageCheckingSet")];

  if (draft)
    return (
      <TestSetReview
        orgId={orgId}
        suiteId={draft.suiteId}
        previews={casePreviews}
        editorHref={`/workspace/test-sets/${draft.suiteId}?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(evaluation.id)}`}
        pending={pending === "approve"}
        error={error}
        onApprove={(version, count) => void approve(version, count)}
      />
    );

  return (
    <div className="p-prep" aria-live="polite">
      {error && <Status error>{error}</Status>}

      <section className="p-section p-section-first">
        <SectionHeading title={t("referenceMaterial")}>{t("referenceMaterialHelp")}</SectionHeading>
        {sources.length + pendingSources.length > 0 && (
          <ul className="p-files">
            {sources.map((item) => (
              <li key={item.id}>
                {item.kind === "website" ? <Globe aria-hidden="true" /> : <FileText aria-hidden="true" />}
                <span className="p-files-name">{item.title}</span>
                <button type="button" className="p-files-excerpts" onClick={() => setExcerptSource(item)} disabled={!!pending}>
                  {item.chunkCount} {item.chunkCount === 1 ? t("excerpt") : t("excerpts")}
                  <span className="sr-only">: {t("viewExcerpts")}</span>
                </button>
                <Badge tone="pass" dot>
                  {t("ready")}
                </Badge>
                <RemoveSourceButton title={item.title} disabled={!!pending} onClick={() => setRemoving(item)} />
              </li>
            ))}
            {pendingSources.map((item) => (
              <li key={item.id}>
                {item.kind === "website" ? <Globe aria-hidden="true" /> : <FileText aria-hidden="true" />}
                <span className="p-files-name">{item.title}</span>
                <span className="p-cell-meta">
                  {item.state === "failed" ? (item.reason ? humanizeReason(item.reason) : t("websiteCaptureFailed")) : item.kind === "website" ? t("websiteReadingHelp") : t("documentReadingHelp")}
                </span>
                {item.state === "failed" ? (
                  <Badge tone="fail" dot>{t("failedLabel")}</Badge>
                ) : (
                  <Badge tone="info" dot live>{item.kind === "website" ? t("readingWebsite") : t("readingDocument")}</Badge>
                )}
                <RemoveSourceButton title={item.title} disabled={!!pending} onClick={() => setRemoving(item)} />
              </li>
            ))}
          </ul>
        )}
        <ExcerptBrowser
          orgId={orgId}
          source={excerptSource}
          open={!!excerptSource}
          onOpenChange={(open) => !open && setExcerptSource(null)}
          onSaved={(update) => {
            if (!excerptSource) return;
            remember({ ...excerptSource, revisionId: update.revisionId, chunks: update.chunks, chunkCount: update.chunks.length });
            void onReady();
          }}
        />
        {removing && (
          <DeleteDialog kind="sources" name={removing.title} onClose={() => setRemoving(null)} onConfirm={() => removeSource(removing.id)} />
        )}
        {!sources.length && sourcesLoading && <p className="p-cell-meta">{t("loading")}</p>}
        <form className="p-drop" onSubmit={upload}>
          <label className="p-drop-zone" data-has-files={files.length ? "true" : undefined}>
            <Upload aria-hidden="true" />
            <span className="p-drop-title">{files.length ? `${files.length} ${files.length === 1 ? t("fileSelected") : t("filesSelected")} · ${size(files.reduce((sum, item) => sum + item.size, 0))}` : t("chooseDocuments")}</span>
            <span className="p-drop-hint">{t("uploadHint")}</span>
            <input ref={fileInput} type="file" accept={ACCEPT} multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} aria-label={t("chooseDocuments")} />
          </label>
          <div className="p-drop-actions">
            <Action variant="ghost" size="sm" onClick={() => setShowWebsite((value) => !value)} aria-expanded={showWebsite}>
              <Globe aria-hidden="true" />
              {t("addWebsite")}
            </Action>
            <span className="p-toolbar-spacer" />
            <Action type="submit" variant="secondary" disabled={!files.length || !!pending}>
              {pending === "upload" ? t("uploadingExtracting") : t("addDocuments")}
            </Action>
          </div>
        </form>
        {showWebsite && (
          <form className="p-inline-form" onSubmit={addWebsite}>
            <Field id="website-url" type="url" inputMode="url" label={t("publicWebsite")} placeholder="https://example.com/help" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} required />
            <SelectField id="website-rights" label={t("contentRights")} required value={websiteRights} onChange={(event) => setWebsiteRights(event.target.value as typeof websiteRights)}>
              <option value="">{t("chooseRights")}</option>
              <option value="customer_owned">{t("rightsOwned")}</option>
              <option value="licensed">{t("rightsLicensed")}</option>
              <option value="public_domain">{t("rightsPublic")}</option>
            </SelectField>
            <p className="p-field-hint">{t("websiteCaptureHelp")}</p>
            <div className="p-row">
              <Action type="submit" variant="secondary" disabled={!websiteUrl.trim() || !websiteRights || !!pending}>
                {pending === "website" ? t("capturingWebsite") : t("addWebsiteContext")}
              </Action>
            </div>
          </form>
        )}
      </section>

      <section className="p-section">
        <SectionHeading title={t("testSet")}>{t("testSetHelp")}</SectionHeading>
        {openQuestions.length > 0 ? (
          <ContextQuestionsForm key={openQuestions.map((item) => item.id).join()} questions={openQuestions} pending={pending === "context"} error={contextError} onSubmit={(answers) => void submitContext(answers)} />
        ) : generating ? (
          <div className="p-working" role="status">
            <span className="p-spinner" aria-hidden="true" />
            <div>
              <p className="p-working-title">{stages[stage]}</p>
              {stage === 1 && progress && progress.target > 12 && (
                <div className="p-working-progress">
                  <Progress value={progress.written} max={Math.max(progress.target, 1)} label={t("stagePreparingQuestions")} />
                  <span className="p-cell-meta">{tv("writingProgress", { done: progress.written, total: progress.target })}</span>
                </div>
              )}
              <ol className="p-working-steps">
                {stages.map((label, index) => (
                  <li key={label} data-state={index < stage ? "done" : index === stage ? "current" : "upcoming"}>
                    {label}
                  </li>
                ))}
              </ol>
              <p className="p-cell-meta">{t("closePageHelp")}</p>
            </div>
          </div>
        ) : (
          <div className="p-generate-block">
            {stopped && <Status tone="warn">{generationStopMessage(stopReason)}</Status>}
            {stopped && !!progress?.written && (
              <div className="p-row">
                <Action variant="secondary" onClick={() => void keepPartial()} disabled={!!pending}>
                  {tv("keepPartial", { n: progress.written })}
                </Action>
              </div>
            )}
            {!(autoJobId && !stopped && generation !== "paused") && (
              <ScopePicker size={scopeSize} complexity={complexity} disabled={!!pending} onSize={setScopeSize} onComplexity={setComplexity} />
            )}
            <div className="p-generate">
              <Action onClick={() => void generateAutomatically()} disabled={!sources.length || !!pending}>
                <Sparkles aria-hidden="true" />
                {stopped ? t("generateAgain") : autoJobId && generation !== "paused" ? t("resumePreparation") : t("generateTestSet")}
              </Action>
              <span className="p-cell-meta">{pendingSources.some((item) => item.state === "reading") ? t("generateWaitForReading") : sources.length ? t("generateHelp") : t("generateNeedsSources")}</span>
            </div>
          </div>
        )}

        {!generating && !openQuestions.length && source && (
          <div className="p-disclosure">
            <button type="button" className="p-disclosure-trigger" aria-expanded={showManual} onClick={() => setShowManual((value) => !value)}>
              <Plus aria-hidden="true" />
              {t("writeTestYourself")}
            </button>
            {showManual && (
              <form className="p-inline-form" onSubmit={prepareManually}>
                <p className="p-field-hint">{t("writeTestYourselfHelp")}</p>
                {sources.length > 1 && (
                  <SelectField id="manual-source" label={t("source")} value={source.id} onChange={(event) => { setManualSource(event.target.value); setAnchor(""); }}>
                    {sources.map((item) => (
                      <option key={item.id} value={item.id}>{item.title}</option>
                    ))}
                  </SelectField>
                )}
                <TextArea id="manual-question" label={t("exampleQuestion")} value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} required />
                <TextArea id="manual-answer" label={t("approvedAnswer")} value={expected} onChange={(event) => setExpected(event.target.value)} rows={2} required />
                <SelectField id="manual-anchor" label={t("supportingExcerpt")} value={anchor} onChange={(event) => setAnchor(event.target.value)} required>
                  <option value="">{t("chooseExcerpt")}</option>
                  {source.chunks.map((chunk) => (
                    <option key={chunk.id} value={chunk.id}>
                      {chunk.excerpt.slice(0, 140)}
                    </option>
                  ))}
                </SelectField>
                <div className="p-grid-2 p-form-grid">
                  <TextArea id="manual-purpose" label={t("purpose")} value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} required />
                  <Field id="manual-asof" type="date" label={t("asOfDate")} value={asOf} onChange={(event) => setAsOf(event.target.value)} required hint={t("asOfHint")} />
                </div>
                <div className="p-row">
                  <Action type="submit" variant="secondary" disabled={!purpose.trim() || !question.trim() || !expected.trim() || !asOf || !anchor || !!pending}>
                    {pending === "manual" ? t("preparing") : t("prepareTestSet")}
                  </Action>
                </div>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function RemoveSourceButton({ title, disabled, onClick }: { title: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="p-btn" data-variant="ghost" data-shape="icon" data-size="sm" aria-label={`${t("removeSource")}: ${title}`} title={t("removeSource")} disabled={disabled} onClick={onClick}>
      <X aria-hidden="true" />
    </button>
  );
}

/** Why a generation stopped, in terms of what to do next. */
export function generationStopMessage(reason: string | null | undefined) {
  switch (reason) {
    case "network_unavailable":
    case "worker_lease_expired":
      return t("genStopUnknownAttempt");
    case "model_reasoning_exhausted":
      return t("genStopReasoning");
    case "generation_output_exhausted":
    case "incomplete_response":
    case "model_output_incomplete":
      return t("genStopIncomplete");
    case "model_output_not_json":
      return t("genStopNotJson");
    case "budget_exceeded":
      return t("genStopBudget");
    default:
      return t("genStopOther");
  }
}

function humanizeReason(reason: string) {
  const known: Record<string, MessageKey> = {
    website_capture_unavailable: "reasonWebsiteUnavailable",
    website_page_unavailable: "reasonWebsitePage",
    website_text_unavailable: "reasonWebsiteText",
    website_redirect_scope_denied: "reasonWebsiteRedirect",
    destination_denied: "reasonDestinationDenied",
    website_url_invalid: "reasonWebsiteUrl",
    website_worker_interrupted: "reasonWebsiteInterrupted",
  };
  return known[reason] ? t(known[reason]) : reason.replaceAll("_", " ");
}
