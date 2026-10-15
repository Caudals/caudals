"use client";

import { useCallback, useEffect, useState } from "react";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, RowTitle, SectionHeading, Status, StatusBadge, humanize } from "./primitives";
import { t } from "@/lib/evals/messages/runtime";
import { percent } from "./ops-labels";

type Judgments = {
  jobs: Array<{ id: string; case_revision_id: string; status: string; reason_code: string | null; result_assessment_id: string | null }>;
  calibration: Array<{ modelRevisionId: string; promptRevision: string; examples: number; agreement: number | null; criticalDisagreements: number; adequate: boolean }>;
};

/** Rubric-judge progress and calibration for one run (operator inspector). */
export function RunJudgments({ orgId, runId }: { orgId: string; runId: string }) {
  const [data, setData] = useState<Judgments | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    try { setData(await evalRequest<Judgments>(`/runs/${runId}/judgments?orgId=${encodeURIComponent(orgId)}`)); setError(""); }
    catch { setError(t("error")); }
  }, [orgId, runId]);
  useEffect(() => { void load(); }, [load]);
  async function collect() {
    setPending(true);
    try { await evalRequest(`/runs/${runId}/judgments`, "POST", { orgId }); await load(); }
    catch { setError(t("error")); }
    finally { setPending(false); }
  }
  if (!data || !data.jobs.length) return error ? <Status error>{error}</Status> : null;
  const counts = data.jobs.reduce<Record<string, number>>((all, job) => ({ ...all, [job.status]: (all[job.status] ?? 0) + 1 }), {});
  return (
    <section className="p-section" aria-label={t("rubricJudge")}>
      <SectionHeading title={t("rubricJudge")} actions={counts.queued ? <Action variant="secondary" size="sm" onClick={() => void collect()} disabled={pending}>{t("collectJudgeResults")}</Action> : undefined}>{t("rubricJudgeHelp")}</SectionHeading>
      {error && <Status error>{error}</Status>}
      {/* Counts as pills and calibration as a sentence, so the block reads before the table (launch R4). */}
      <div className="p-toolbar">
        {Object.entries(counts).map(([status, count]) => <StatusBadge key={status} value={status} label={`${humanize(status)} · ${count}`} />)}
      </div>
      {data.calibration.map((item) => (
        <p key={`${item.modelRevisionId}-${item.promptRevision}`} className="p-row p-cell-meta p-judge-calibration">
          <span>
            {t("judgeCalibration")} <code className="p-code">{item.promptRevision}</code>: {item.examples} {t("calibrationExamples")}
            {item.agreement === null ? "" : ` · ${percent(item.agreement)} ${t("agreement")}`}
          </span>
          {!item.adequate && <Badge tone="warn">{t("calibrationExperimental").replace(/^./, (first) => first.toUpperCase())}</Badge>}
        </p>
      ))}
      <DataTable caption={t("rubricJudge")} headers={[t("test"), t("statusLabel"), t("reason")]}>
        {data.jobs.map((job) => (
          <tr key={job.id}>
            <RowTitle><code className="p-code">{job.case_revision_id.slice(0, 12)}</code></RowTitle>
            <td><StatusBadge value={job.status} /></td>
            <td className="p-cell-meta">{job.reason_code ? humanize(job.reason_code) : "—"}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
