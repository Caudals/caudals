"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { Status } from "./primitives";

export async function publishPreliminaryManualReport(orgId: string, runId: string) {
  await evalRequest(`/runs/${runId}/score`, "POST", { orgId, graderRevisionId: "customer-manual-deterministic-v1" });
  const report = await evalRequest<{ reportId: string; revisionId: string }>("/reports", "POST", {
    orgId, runId, title: "Preliminary evaluation results", reviewStatus: "preliminary", scorerVersion: "strict-v1",
  }, `customer-manual-report-${runId}`);
  await evalRequest(`/reports/${report.reportId}/publish`, "POST", { orgId, revisionId: report.revisionId });
  return report;
}

export function ManualAnswers({ orgId, projectId, runId, suiteVersionId, pendingCount, onSaved }: {
  orgId: string;
  projectId: string;
  runId: string;
  suiteVersionId: string;
  pendingCount: number;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (extension !== "csv" && extension !== "jsonl" && extension !== "xlsx") throw new Error("Choose a CSV, JSONL or XLSX answer sheet.");
      if (file.size < 1 || file.size > 25_000_000) throw new Error("Choose a file up to 25 MB.");
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const key = `${runId}-${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      const form = new FormData();
      form.set("orgId", orgId);
      form.set("projectId", projectId);
      form.set("suiteVersionId", suiteVersionId);
      form.set("intent", "manual_answers");
      form.set("format", extension);
      form.set("mapping", JSON.stringify({
        case_id: "case_id", case_revision_id: "case_revision_id", suite_version_id: "suite_version_id",
        input: "input", system_answer: "system_answer",
      }));
      form.set("file", file);
      const response = await fetch("/api/evals/v1/imports", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: form,
      });
      if (!response.ok) throw new Error("The answer sheet could not be read. Check its columns and retry.");
      const imported = (await response.json()).data as { id: string };
      const applied = await evalRequest<{ saved: number; errors: Array<{ rowNumber: number; errors: string[] }>; missing: string[]; complete: boolean }>(
        `/imports/${imported.id}/apply`, "POST", { orgId, runId },
      );
      if (!applied.complete) {
        const rows = applied.errors.slice(0, 5).map((item) => `row ${item.rowNumber}: ${item.errors.join(", ")}`).join("; ");
        setMessage(`${applied.saved} answer${applied.saved === 1 ? "" : "s"} saved. ${applied.missing.length} question${applied.missing.length === 1 ? "" : "s"} still need answers.${rows ? ` Check ${rows}.` : ""}`);
        await onSaved();
        return;
      }
      await publishPreliminaryManualReport(orgId, runId);
      setMessage("All answers matched. Your preliminary private report is ready.");
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Answers could not be saved. Retry or ask Caudals for help.");
    } finally {
      setPending(false);
    }
  }

  return <section className="eval-flow-card" aria-live="polite">
    <p className="eval-eyebrow">Waiting for your answers</p>
    <h2>Collect answers from your system</h2>
    <p>Download the questions, fill in the <code>system_answer</code> column, and upload the sheet. Keep the question and ID columns unchanged. {pendingCount} question{pendingCount === 1 ? "" : "s"} remain.</p>
    <p><a className="eval-text-link" href={`/api/evals/v1/suites/${suiteVersionId}/candidate-template?orgId=${encodeURIComponent(orgId)}&format=csv`}>Download question sheet (CSV)</a></p>
    <form className="eval-form" onSubmit={submit}>
      <label className="eval-field"><span>Completed answer sheet</span><input type="file" accept=".csv,.jsonl,.xlsx" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <Button disabled={!file || pending}>{pending ? "Checking answers…" : "Upload answers"}</Button>
    </form>
    {message && <Status>{message}</Status>}
    {error && <Status error>{error}</Status>}
  </section>;
}
