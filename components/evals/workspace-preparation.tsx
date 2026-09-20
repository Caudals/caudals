"use client";

import { useEffect, useState } from "react";
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
};
type Draft = { suiteId: string; suiteVersionId: string; suiteDraftVersion: number };
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
  const [source, setSource] = useState<{ id: string; revisionId: string; chunks: SourceDetail["chunks"] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [casePreviews, setCasePreviews] = useState<CasePreview[]>([]);
  const [purpose, setPurpose] = useState(evaluation.project_description);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [anchor, setAnchor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!evaluation.latest_source_id || !evaluation.latest_source_revision_id) return;
    let live = true;
    void evalRequest<SourceDetail>(`/sources/${evaluation.latest_source_id}?orgId=${orgId}`)
      .then((detail) => { if (live) setSource({ id: evaluation.latest_source_id!, revisionId: evaluation.latest_source_revision_id!, chunks: detail.chunks }); })
      .catch(() => { if (live) setError("The document could not be loaded. Retry or ask Caudals for help."); });
    return () => { live = false; };
  }, [evaluation.latest_source_id, evaluation.latest_source_revision_id, orgId]);

  useEffect(() => {
    if (evaluation.preparation_status !== "needs_review") return;
    let live = true;
    void evalRequest<{ draft: Draft | null; casePreviews: CasePreview[] }>(`/evaluations/${evaluation.id}/context?orgId=${orgId}`)
      .then((state) => { if (live && state.draft) { setDraft(state.draft); setCasePreviews(state.casePreviews ?? []); } })
      .catch(() => { if (live) setError("Preparation could not be resumed. Ask Caudals for help."); });
    return () => { live = false; };
  }, [evaluation.id, evaluation.preparation_status, orgId]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true); setError("");
    try {
      if (file.size > 1_048_576 || file.size < 1) throw new Error("Choose a document up to 1 MB.");
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      const mediaType = extension === "md" ? "text/markdown" : extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : extension === "txt" ? "text/plain" : null;
      if (!mediaType) throw new Error("Use a TXT, MD or DOCX document.");
      const bytes = await file.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const uploadInput = { orgId, projectId: evaluation.project_id, title: file.name, rights: "customer_owned", visibility: "internal", mediaType, byteSize: file.size, sha256: hash };
      const created = await evalRequest<{ sourceId: string; uploadUrl: string }>("/sources/uploads", "POST", uploadInput, await stableKey("source-upload", uploadInput));
      const existing = await evalRequest<SourceDetail & { revisions: Array<{ id: string }> }>(`/sources/${created.sourceId}?orgId=${orgId}`);
      if (existing.revisions.length) {
        setSource({ id: created.sourceId, revisionId: existing.revisions[0].id, chunks: existing.chunks });
        setAnchor(existing.chunks[0]?.id ?? "");
        await onReady();
        return;
      }
      const uploaded = await fetch(created.uploadUrl, { method: "PUT", body: bytes, credentials: "same-origin", cache: "no-store" });
      if (!uploaded.ok) throw new Error("The document upload did not finish. Please retry.");
      const finalized = await evalRequest<{ revisionId: string }>(`/sources/${created.sourceId}/finalize`, "POST", { orgId }, `source-finalize-${created.sourceId}`);
      const detail = await evalRequest<SourceDetail>(`/sources/${created.sourceId}?orgId=${orgId}`);
      setSource({ id: created.sourceId, revisionId: finalized.revisionId, chunks: detail.chunks });
      setAnchor(detail.chunks[0]?.id ?? "");
      await onReady();
    } catch (value) { setError(value instanceof Error ? value.message : "The document could not be prepared."); }
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
    <p>Use your own policy document and an example question with its approved answer. Caudals keeps the source and test set private.</p>
    {error && <Status error>{error}</Status>}
    {!source && <form className="eval-flow-card eval-form" onSubmit={upload}>
      <label className="eval-field"><span>Policy document</span><input type="file" accept=".txt,.md,.docx" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <Button disabled={!file || pending}>{pending ? "Uploading…" : "Use this document"}</Button>
    </form>}
    {source && !draft && <form className="eval-flow-card eval-form" onSubmit={prepare}>
      <p>Using a source document with {source.chunks.length} excerpt{source.chunks.length === 1 ? "" : "s"}. <button type="button" className="eval-text-link" onClick={() => setSource(null)}>Use a different document</button></p>
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
