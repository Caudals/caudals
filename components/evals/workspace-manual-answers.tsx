"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { evalRequest } from "./api";
import { Action, ActionAnchor, Progress, Status } from "./primitives";
import { t } from "@/lib/evals/messages/en";

export async function publishPreliminaryManualReport(orgId: string, runId: string, evaluationTitle?: string) {
  await evalRequest(`/runs/${runId}/score`, "POST", { orgId, graderRevisionId: "caudals-grader-v2" });
  const report = await evalRequest<{ reportId: string; revisionId: string }>(
    "/reports",
    "POST",
    { orgId, runId, title: evaluationTitle ? `${evaluationTitle} — preliminary results` : "Preliminary evaluation results", reviewStatus: "preliminary", scorerVersion: "auto-preliminary-v2" },
    `customer-manual-report-${runId}`,
  );
  await evalRequest(`/reports/${report.reportId}/publish`, "POST", { orgId, revisionId: report.revisionId });
  return report;
}

/**
 * "Waiting for your answers" (spec §8.4): download the candidate-only question
 * sheet, fill in the system's answers, upload. Partial uploads are kept and the
 * remaining questions stay open; nothing is sent to the system automatically.
 */
export function ManualAnswers({
  orgId,
  projectId,
  runId,
  suiteVersionId,
  pendingCount,
  totalCount,
  onSaved,
  evaluationTitle,
}: {
  evaluationTitle?: string;
  orgId: string;
  projectId: string;
  runId: string;
  suiteVersionId: string;
  pendingCount: number;
  totalCount: number;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (extension !== "csv" && extension !== "jsonl" && extension !== "xlsx") throw new Error(t("answerSheetType"));
      if (file.size < 1 || file.size > 25_000_000) throw new Error(t("answerSheetSize"));
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const key = `${runId}-${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      const form = new FormData();
      form.set("orgId", orgId);
      form.set("projectId", projectId);
      form.set("suiteVersionId", suiteVersionId);
      form.set("intent", "manual_answers");
      form.set("format", extension);
      form.set(
        "mapping",
        JSON.stringify({ case_id: "case_id", case_revision_id: "case_revision_id", suite_version_id: "suite_version_id", input: "input", system_answer: "system_answer" }),
      );
      form.set("file", file);
      const response = await fetch("/api/evals/v1/imports", { method: "POST", headers: { "Idempotency-Key": key }, body: form });
      if (!response.ok) throw new Error(t("answerSheetUnreadable"));
      const imported = (await response.json()).data as { id: string };
      const applied = await evalRequest<{ saved: number; errors: Array<{ rowNumber: number; errors: string[] }>; missing: string[]; complete: boolean }>(
        `/imports/${imported.id}/apply`,
        "POST",
        { orgId, runId },
      );
      setFile(null);
      if (input.current) input.current.value = "";
      if (!applied.complete) {
        const rows = applied.errors.slice(0, 5).map((item) => `row ${item.rowNumber}: ${item.errors.join(", ")}`).join("; ");
        setMessage(
          `${applied.saved} ${applied.saved === 1 ? t("answerSaved") : t("answersSaved")}. ${applied.missing.length} ${applied.missing.length === 1 ? t("questionStillOpen") : t("questionsStillOpen")}.${rows ? ` ${t("check")} ${rows}.` : ""}`,
        );
        await onSaved();
        return;
      }
      await publishPreliminaryManualReport(orgId, runId, evaluationTitle);
      setMessage(t("allAnswersMatched"));
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("answersNotSaved"));
    } finally {
      setPending(false);
    }
  }

  const answered = totalCount - pendingCount;
  return (
    <section className="p-panel-block" aria-live="polite">
      <div className="p-panel-block-head">
        <h2>{t("waitingForAnswers")}</h2>
      </div>
      <div className="p-panel-block-body">
        <p>{t("manualAnswersHelp")}</p>
        <div className="p-run-progress">
          <p className="p-run-count">
            <strong>{answered}</strong> {t("of")} {totalCount} {t("answersReceived")}
          </p>
          <Progress value={answered} max={Math.max(totalCount, 1)} label={t("answersReceived")} />
        </div>
        <ol className="p-list-steps">
          <li>
            <ActionAnchor variant="secondary" size="sm" href={`/api/evals/v1/suites/${suiteVersionId}/candidate-template?orgId=${encodeURIComponent(orgId)}&format=csv`}>
              <Download aria-hidden="true" />
              {t("downloadQuestionSheet")}
            </ActionAnchor>
          </li>
          <li>{t("fillSystemAnswer")}</li>
          <li>
            <form className="p-row" onSubmit={submit}>
              <label className="p-file-button">
                <Upload aria-hidden="true" />
                <span>{file ? file.name : t("chooseAnswerSheet")}</span>
                <input ref={input} type="file" accept=".csv,.jsonl,.xlsx" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <Action type="submit" disabled={!file || pending}>
                {pending ? t("checkingAnswers") : t("uploadAnswersAction")}
              </Action>
            </form>
          </li>
        </ol>
        {message && <Status tone="success">{message}</Status>}
        {error && <Status error>{error}</Status>}
      </div>
    </section>
  );
}
