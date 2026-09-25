"use client";

import { useCallback, useEffect, useState } from "react";
import { evalRequest } from "./api";
import { Action, DataTable, DefinitionList, RowTitle, Status, StatusBadge } from "./primitives";
import { t } from "@/lib/evals/messages/en";

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
    <section className="eval-panel" aria-label={t("rubricJudge")}>
      <h2>{t("rubricJudge")}</h2>
      <p className="p-cell-meta">{t("rubricJudgeHelp")}</p>
      {error && <Status error>{error}</Status>}
      <DefinitionList items={[
        ...Object.entries(counts).map(([status, count]) => ({ term: status.replaceAll("_", " "), value: count })),
        ...data.calibration.map((item) => ({
          term: `${t("judgeCalibration")} · ${item.promptRevision}`,
          value: `${item.examples} ${t("calibrationExamples")} · ${item.agreement === null ? "—" : `${Math.round(item.agreement * 100)}%`}${item.adequate ? "" : ` · ${t("calibrationExperimental")}`}`,
        })),
      ]} />
      {counts.queued ? <Action variant="secondary" size="sm" onClick={() => void collect()} disabled={pending}>{t("collectJudgeResults")}</Action> : null}
      <DataTable caption={t("rubricJudge")} headers={[t("test"), t("statusLabel"), t("reason")]}>
        {data.jobs.map((job) => (
          <tr key={job.id}>
            <RowTitle><code className="p-code">{job.case_revision_id}</code></RowTitle>
            <td><StatusBadge value={job.status} /></td>
            <td className="p-cell-meta">{job.reason_code?.replaceAll("_", " ") ?? "—"}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
