"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { Status } from "./primitives";

type Evaluation = {
  id: string;
  title: string;
  project_id: string;
  project_description: string;
  latest_source_id: string | null;
  latest_source_revision_id: string | null;
  preparation_status: string;
};
type SourceDetail = {
  chunks: Array<{ id: string; excerpt: string }>;
  revisions?: Array<{ id: string }>;
  ingestion?: { status: string; source_revision_id: string | null; reason_code: string | null } | null;
  websiteCapture?: { id: string; start_url: string; status: string; reason_code: string | null; source_revision_id: string | null } | null;
};
type PreparedSource = { id: string; revisionId: string; chunks: SourceDetail["chunks"]; kind: "document" | "website" };
type Draft = { suiteId: string; suiteVersionId: string; suiteDraftVersion: number };
type ContextQuestion = { id:string; field:string; question:string; critical:boolean; status:string };
type CasePreview = { caseRevisionId: string; question: string; approvedAnswer: string; sourceExcerpt: string | null };

async function stableKey(action: string, payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `${action}-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function PrepareEvaluation({ orgId, evaluation, executionMode = "deployed_system", onReady }: {
  orgId: string;
  evaluation: Evaluation;
  executionMode?: "deployed_system" | "imported_responses";
  onReady: () => Promise<void>;
}) {
  const [source, setSource] = useState<PreparedSource | null>(null);
  const [sources, setSources] = useState<PreparedSource[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [casePreviews, setCasePreviews] = useState<CasePreview[]>([]);
  const [purpose, setPurpose] = useState(evaluation.project_description);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [anchor, setAnchor] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteRights, setWebsiteRights] = useState<"customer_owned" | "licensed" | "public_domain" | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [autoJobId, setAutoJobId] = useState<string | null>(null);
  const [contextQuestions, setContextQuestions] = useState<ContextQuestion[]>([]);
  const [contextAnswers, setContextAnswers] = useState<Record<string, string>>({});
  const autoResumeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!evaluation.latest_source_id || !evaluation.latest_source_revision_id) return;
    let live = true;
    void evalRequest<SourceDetail>(`/sources/${evaluation.latest_source_id}?orgId=${orgId}`)
      .then((detail) => { if (live) { const prepared: PreparedSource = { id: evaluation.latest_source_id!, revisionId: evaluation.latest_source_revision_id!, chunks: detail.chunks, kind: detail.websiteCapture ? "website" : "document" }; setSource(prepared); setSources([prepared]); } })
      .catch(() => { if (live) setError("The document could not be loaded. Retry or ask Caudals for help."); });
    return () => { live = false; };
  }, [evaluation.latest_source_id, evaluation.latest_source_revision_id, orgId]);


  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || pending) return;
    setPending(true); setError("");
    try {
      if (sources.filter((item) => item.kind === "document").length + files.length > 20 || files.some((item) => item.size < 1 || item.size > 25_000_000) || files.reduce((sum, item) => sum + item.size, 0) > 100_000_000) {
        throw new Error("Choose up to 20 files, 25 MB each and 100 MB total.");
      }
      const prepared: PreparedSource[] = [...sources];
      for (const file of files) {
        const extension = file.name.split(".").at(-1)?.toLowerCase();
        const mediaType = extension === "md" ? "text/markdown" : extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : extension === "txt" ? "text/plain" : extension === "pdf" ? "application/pdf" : extension === "csv" ? "text/csv" : extension === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : null;
        if (!mediaType) throw new Error("Use TXT, MD, DOCX, PDF, CSV or XLSX files.");
        const bytes = await file.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const uploadInput = { orgId, projectId: evaluation.project_id, evaluationId: evaluation.id, title: file.name, rights: "customer_owned", visibility: "internal", mediaType, byteSize: file.size, sha256: hash };
        const created = await evalRequest<{ sourceId: string; uploadUrl: string }>("/sources/uploads", "POST", uploadInput, await stableKey("source-upload", uploadInput));
        let detail = await evalRequest<SourceDetail>("/sources/" + created.sourceId + "?orgId=" + orgId);
        let revisionId = detail.revisions?.[0]?.id ?? detail.ingestion?.source_revision_id ?? null;
        if (!revisionId) {
          const uploaded = await fetch(created.uploadUrl, { method: "PUT", body: bytes, credentials: "same-origin", cache: "no-store" });
          if (!uploaded.ok) throw new Error("The document upload did not finish. Please retry.");
          await evalRequest("/sources/" + created.sourceId + "/finalize", "POST", { orgId }, "source-finalize-" + created.sourceId);
          for (let attempt = 0; attempt < 150; attempt++) {
            detail = await evalRequest<SourceDetail>("/sources/" + created.sourceId + "?orgId=" + orgId);
            if (detail.ingestion?.status === "completed") {
              revisionId = detail.ingestion.source_revision_id ?? detail.revisions?.[0]?.id ?? null;
              break;
            }
            if (detail.ingestion?.status === "failed") throw new Error("A document could not be extracted. Check that it contains supported text and try another copy.");
            await new Promise((resolve) => setTimeout(resolve, 2_000));
          }
          if (!revisionId) throw new Error("Document extraction is still running. You can reopen this evaluation to check again.");
        }
        const item: PreparedSource = { id: created.sourceId, revisionId, chunks: detail.chunks, kind: "document" };
        const existingIndex = prepared.findIndex((current) => current.id === item.id);
        if (existingIndex >= 0) prepared[existingIndex] = item;
        else prepared.push(item);
        setSources([...prepared]);
        setSource(prepared[0]);
        if (prepared.length === 1) setAnchor(detail.chunks[0]?.id ?? "");
      }
      setSource(prepared[0] ?? null);
      setSources(prepared);
      await onReady();
    } catch (value) { setError(value instanceof Error ? value.message : "The document could not be prepared."); }
    finally { setPending(false); }
  }


  async function addWebsite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!websiteUrl.trim() || !websiteRights || pending) return;
    setPending(true); setError("");
    try {
      const input = { orgId, evaluationId: evaluation.id, projectId: evaluation.project_id, url: websiteUrl.trim(), rights: websiteRights };
      const started = await evalRequest<{ sourceId: string; jobId: string }>("/sources/websites", "POST", input, await stableKey("website-source", input));
      let prepared: PreparedSource | null = null;
      for (let attempt = 0; attempt < 150; attempt++) {
        const detail = await evalRequest<SourceDetail>("/sources/" + started.sourceId + "?orgId=" + orgId);
        if (detail.websiteCapture?.status === "failed") throw new Error("The public pages could not be captured. Check the address and try again.");
        if (detail.websiteCapture?.status === "completed" && detail.ingestion?.status === "completed") {
          const revisionId = detail.websiteCapture.source_revision_id ?? detail.ingestion.source_revision_id;
          if (revisionId) prepared = { id: started.sourceId, revisionId, chunks: detail.chunks, kind: "website" };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!prepared) throw new Error("Website preparation is still queued. Reopen this evaluation to check its progress.");
      const nextSources = [...sources.filter((item) => item.id !== prepared!.id), prepared];
      setSources(nextSources);
      setSource(nextSources[0]);
      if (!anchor) setAnchor(nextSources[0]?.chunks[0]?.id ?? "");
      setWebsiteUrl("");
      await onReady();
    } catch (value) { setError(value instanceof Error ? value.message : "The website could not be prepared."); }
    finally { setPending(false); }
  }

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || !anchor || pending) return;
    setPending(true); setError("");
    try {
      const contextInput = { orgId, purpose, tasks: [question], languages: ["en"], asOf: new Date(`${asOf}T00:00:00.000Z`).toISOString(), sources: [{ revisionId: source.revisionId, authority: "customer_supplied" }], promptRevision: "customer-context-v1" };
      const context = await evalRequest<{ status: string }>(`/evaluations/${evaluation.id}/context`, "POST", contextInput, await stableKey("evaluation-context", contextInput));
      if (context.status === "needs_input") throw new Error("A key detail is missing. Check the purpose and date, then retry.");
      const generationInput = { orgId, sourceRevisionId: source.revisionId, title: `${evaluation.title} test set`, executionMode, questions: [{ question, expected, anchor }], promptRevision: "customer-example-v1" };
      const prepared = await evalRequest<Draft & { status: string }>(`/evaluations/${evaluation.id}/generate`, "POST", generationInput, await stableKey("evaluation-generate", generationInput));
      if (prepared.status !== "needs_review") throw new Error("The test set needs Caudals review before use.");
      setDraft(prepared);
      setCasePreviews([{ caseRevisionId: prepared.suiteVersionId, question, approvedAnswer: expected, sourceExcerpt: source.chunks.find((chunk) => chunk.id === anchor)?.excerpt ?? null }]);
      await onReady();
    } catch (value) { setError(value instanceof Error ? value.message : "The test set could not be prepared."); }
    finally { setPending(false); }
  }

  const continueAutomaticGeneration = useCallback(async (jobId: string) => {
    if (autoResumeRef.current === jobId) return;
    autoResumeRef.current = jobId;
    setAutoJobId(jobId);
    setPending(true); setError("");
    try {
      for (let attempt = 0; attempt < 180; attempt++) {
        const state = await evalRequest<{ status: string; job: { id: string; suiteId?: string | null; suiteVersionId?: string | null } | null }>("/evaluations/" + evaluation.id + "/generate?orgId=" + orgId + "&jobId=" + jobId);
        if (state.status === "needs_review") {
          const review = await evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>("/evaluations/" + evaluation.id + "/context?orgId=" + orgId);
          if (review.draft) {
            setDraft(review.draft);
            setCasePreviews(review.casePreviews ?? []);
            await onReady();
            return;
          }
        } else if (state.status === "profile_ready") {
          await evalRequest("/evaluations/" + evaluation.id + "/generate/advance", "POST", { orgId, jobId }, "auto-profile-" + jobId);
        } else if (state.status === "draft_ready") {
          const prepared = await evalRequest<{ status: string; suiteId?: string; suiteVersionId?: string; suiteDraftVersion?: number }>("/evaluations/" + evaluation.id + "/generate/advance", "POST", { orgId, jobId }, "auto-draft-" + jobId);
          if (prepared.status === "needs_review" && prepared.suiteId && prepared.suiteVersionId) {
            const review = await evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>("/evaluations/" + evaluation.id + "/context?orgId=" + orgId);
            setDraft(review.draft ?? { suiteId: prepared.suiteId, suiteVersionId: prepared.suiteVersionId, suiteDraftVersion: prepared.suiteDraftVersion ?? 1 });
            setCasePreviews(review.casePreviews ?? []);
            await onReady();
            return;
          }
          if (prepared.status === "quarantined") throw new Error("The generated draft did not pass source and schema checks. No cases were released; review the source before starting a new draft.");
        } else if (state.status === "needs_input") {
          const context = await evalRequest<{ questions: ContextQuestion[] }>("/evaluations/" + evaluation.id + "/context?orgId=" + orgId);
          setContextQuestions(context.questions ?? []);
          throw new Error("Answer the open context questions to continue this saved preparation.");
        } else if (["paused", "quarantined", "failed"].includes(state.status)) {
          throw new Error("Preparation paused or failed. Review the source and retry, or ask Caudals for help.");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error("Preparation is still running. Reopen this evaluation to resume its saved progress.");
    } catch (value) { setError(value instanceof Error ? value.message : "The dataset could not be generated."); }
    finally { autoResumeRef.current = null; setPending(false); }
  }, [evaluation.id, orgId, onReady]);

  useEffect(() => {
    if (!["needs_review", "profiling", "generating", "needs_input"].includes(evaluation.preparation_status)) return;
    let live = true;
    void Promise.all([
      evalRequest<{ draft: Draft | null; casePreviews: CasePreview[]; questions: ContextQuestion[] }>("/evaluations/" + evaluation.id + "/context?orgId=" + orgId),
      evalRequest<{ status: string; job: { id: string } | null }>("/evaluations/" + evaluation.id + "/generate?orgId=" + orgId),
    ]).then(([context, generation]) => {
      if (!live) return;
      setContextQuestions(context.questions ?? []);
      if (context.draft) { setDraft(context.draft); setCasePreviews(context.casePreviews ?? []); }
      if (!generation.job) return;
      setAutoJobId(generation.job.id);
      if (generation.status === "needs_input") return;
      if (["profiling", "profile_ready", "drafting", "draft_ready"].includes(generation.status)) {
        void continueAutomaticGeneration(generation.job.id);
      }
    }).catch(() => { if (live) setError("Preparation could not be resumed. Ask Caudals for help."); });
    return () => { live = false; };
  }, [continueAutomaticGeneration, evaluation.id, evaluation.preparation_status, orgId]);

  async function generateAutomatically() {
    if (!source || pending) return;
    setPending(true); setError("");
    try {
      const sourceRevisionIds = (sources.length ? sources : [source]).map((item) => item.revisionId);
      const input = { mode: "automatic", orgId, sourceRevisionIds, title: evaluation.title + " test set", executionMode, promptRevision: "dgx-context-cases-v1", maxCases: 10 };
      const started = await evalRequest<{ jobId: string }>("/evaluations/" + evaluation.id + "/generate", "POST", input, await stableKey("evaluation-auto-generation", input));
      setAutoJobId(started.jobId);
      setPending(false);
      await continueAutomaticGeneration(started.jobId);
    } catch (value) { setError(value instanceof Error ? value.message : "The dataset could not be generated."); }
    finally { setPending(false); }
  }

  async function answerContextQuestions() {
    if (!autoJobId || pending) return;
    const open = contextQuestions.filter((item) => item.critical && item.status === "open");
    if (!open.length || open.some((item) => !contextAnswers[item.id]?.trim())) return;
    setPending(true); setError("");
    try {
      for (const item of open) {
        const answer = contextAnswers[item.id].trim();
        await evalRequest("/evaluations/" + evaluation.id + "/context/questions/" + item.id, "POST", { orgId, answer }, await stableKey("context-answer-" + item.id, answer));
      }
      setPending(false);
      await continueAutomaticGeneration(autoJobId);
    } catch (value) { setError(value instanceof Error ? value.message : "The context answers could not be saved."); }
    finally { setPending(false); }
  }

  async function approve() {
    if (!draft || pending || !casePreviews.length || casePreviews.some((item) => !item.sourceExcerpt)) return;
    setPending(true); setError("");
    try {
      await evalRequest(`/suites/${draft.suiteId}/versions`, "POST", { orgId, version: draft.suiteDraftVersion }, `suite-freeze-${draft.suiteId}-${draft.suiteDraftVersion}`);
      await evalRequest(`/evaluations/${evaluation.id}/approve-suite`, "POST", { orgId, suiteVersionId: draft.suiteVersionId }, `suite-approve-${evaluation.id}-${draft.suiteVersionId}`);
      await onReady();
    } catch (value) { setError(value instanceof Error ? value.message : "The test set could not be approved."); }
    finally { setPending(false); }
  }

  return <section className="eval-flow" aria-live="polite">
    <h2>Prepare a test set</h2>
    <p>Add reference documents or a public website. Caudals extracts cited context, then the DGX Spark drafts source-grounded questions for review.</p>
    {error && <Status error>{error}</Status>}
    {!draft && <form className="eval-flow-card eval-form" onSubmit={upload}>
      <label className="eval-field"><span>{sources.length ? "Add documents" : "Policy documents"}</span><input type="file" accept=".txt,.md,.docx,.pdf,.csv,.xlsx" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
      <p>Up to 20 files · 25 MB each · 100 MB total. Text, Word, PDF, CSV and Excel files are supported.</p>{files.length > 0 && <p>{files.length} file{files.length === 1 ? "" : "s"} selected · {(files.reduce((sum, item) => sum + item.size, 0) / 1_000_000).toFixed(1)} MB</p>}<Button type="submit" disabled={!files.length || pending}>{pending ? "Uploading and extracting…" : "Add these sources"}</Button>
    </form>}
    {!draft && !sources.some((item) => item.kind === "website") && <form className="eval-flow-card eval-form" onSubmit={addWebsite}>
      <label className="eval-field"><span>Public website</span><input type="url" inputMode="url" placeholder="https://example.com/help" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} required /></label>
      <label className="eval-field"><span>Content rights</span><select required value={websiteRights} onChange={(event) => setWebsiteRights(event.target.value as typeof websiteRights)}><option value="">Choose a rights basis</option><option value="customer_owned">We own this content</option><option value="licensed">We have permission to use it</option><option value="public_domain">Public domain</option></select></label>
      <p>Caudals reads up to 50 public pages on this host. Confirm you have rights to use this content. It does not sign in, submit forms or follow links to other hosts.</p>
      <Button type="submit" disabled={!websiteUrl.trim() || !websiteRights || pending}>{pending ? "Capturing and extracting…" : "Add website context"}</Button>
    </form>}
    {contextQuestions.some((item) => item.critical && item.status === "open") && <form className="eval-flow-card eval-form" onSubmit={(event) => { event.preventDefault(); void answerContextQuestions(); }}>
      <h3>A little more context is needed</h3>
      <p>Your answers are saved with this preparation. They do not replace the cited source material.</p>
      {contextQuestions.filter((item) => item.critical && item.status === "open").map((item) => <label key={item.id} className="eval-field"><span>{item.question}</span><textarea required maxLength={2000} value={contextAnswers[item.id] ?? ""} onChange={(event) => setContextAnswers((current) => ({ ...current, [item.id]: event.target.value }))} /></label>)}
      <Button disabled={pending || contextQuestions.filter((item) => item.critical && item.status === "open").some((item) => !contextAnswers[item.id]?.trim())}>{pending ? "Saving and resuming…" : "Save answers and continue"}</Button>
    </form>}
    {autoJobId && !draft && !contextQuestions.some((item) => item.critical && item.status === "open") && <div className="eval-flow-card"><p>Automatic preparation is saved and can resume after you leave this page.</p><Button type="button" disabled={pending} onClick={() => void continueAutomaticGeneration(autoJobId)}>{pending ? "Preparing…" : "Resume preparation"}</Button></div>}
    {source && !draft && <form className="eval-flow-card eval-form" onSubmit={prepare}>
      <p>Using {sources.length} source{sources.length === 1 ? "" : "s"}; the first has {source.chunks.length} excerpt{source.chunks.length === 1 ? "" : "s"}.</p>
      <Button type="button" disabled={pending} onClick={generateAutomatically}>{pending ? "Generating…" : "Generate a draft from this context"}</Button>
      <p>Or prepare one manually with an approved answer from the first source:</p>
      <label className="eval-field"><span>Purpose</span><textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} required /></label>
      <label className="eval-field"><span>As-of date</span><input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} required /></label>
      <label className="eval-field"><span>Example customer question</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} required /></label>
      <label className="eval-field"><span>Approved answer</span><textarea value={expected} onChange={(event) => setExpected(event.target.value)} required /></label>
      <label className="eval-field"><span>Supporting excerpt</span><select value={anchor} onChange={(event) => setAnchor(event.target.value)} required><option value="">Choose an excerpt</option>{source.chunks.map((chunk) => <option key={chunk.id} value={chunk.id}>{chunk.excerpt.slice(0, 140)}</option>)}</select></label>
      <Button disabled={!purpose.trim() || !question.trim() || !expected.trim() || !asOf || !anchor || pending}>{pending ? "Preparing…" : "Prepare test set"}</Button>
    </form>}
    {draft && <div className="eval-flow-card"><h3>Review your test set</h3><p>This example will be assessed as a preliminary, customer-approved test. Check the question, answer and source before continuing.</p>{casePreviews.length ? casePreviews.map((item) => <div key={item.caseRevisionId} className="eval-flow-card"><p><strong>Question:</strong> {item.question}</p><p><strong>Approved answer:</strong> {item.approvedAnswer}</p><p><strong>Source excerpt:</strong> {item.sourceExcerpt ?? "Source excerpt unavailable. Ask Caudals for help."}</p></div>) : <p>The draft is loading. If it remains unavailable, ask Caudals for help.</p>}<Button onClick={approve} disabled={pending || !casePreviews.length || casePreviews.some((item) => !item.sourceExcerpt)}>{pending ? "Saving…" : "Approve test set"}</Button></div>}
  </section>;
}
