"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { Badge, EmptyState, Loading, SectionHeading, Status, StatusBadge } from "./primitives";
import { ClipboardCheck } from "lucide-react";
import { t } from "@/lib/evals/messages/en";

type Workspace = { id: string; name: string };
type Item = {
  assessment_id: string; outcome: string; review_status: string; rationale: string; criteria: Array<{ criterion_id: string; score: number | null; rationale: string }>;
  case_title: string; severity: string; question: string | null; answer: string | null; expected: unknown; source_refs: Array<{ source_revision_id: string; anchor: string }>;
  evaluation_title: string; judge_reason: string | null; judge_calibration: { examples: number; agreement: number | null; adequate: boolean } | null;
};
const scoreFor = { pass: 1, partial: 0.5, fail: 0, unscorable: null } as const;

/**
 * Exception-first result review (spec §5.5 step 5, §11.3-§11.4): critical and
 * disputed results first, each with the question, the captured answer, the
 * expectation and source anchors. Decisions append attributed records; an
 * override creates a new assessment and never deletes the model judgment.
 */
export function AssessmentReviewQueue() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [orgId, setOrgId] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");
  useEffect(() => { void evalRequest<Workspace[]>("/workspaces").then((rows) => { setWorkspaces(rows); setOrgId((current) => current || rows[0]?.id || ""); }).catch(() => setError(t("error"))); }, []);
  const load = useCallback(async () => {
    if (!orgId) return;
    setItems(null);
    try { setItems(await evalRequest<Item[]>(`/reviews?orgId=${encodeURIComponent(orgId)}`)); setError(""); }
    catch { setError(t("error")); setItems([]); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function decide(item: Item, form: HTMLFormElement) {
    const data = new FormData(form);
    const decision = String(data.get("decision")) as "approve" | "dispute" | "override";
    const reason = String(data.get("reason") ?? "").trim();
    if (!reason) { setError(t("reviewReasonRequired")); return; }
    const outcome = String(data.get("outcome") ?? item.outcome) as keyof typeof scoreFor;
    setPending(item.assessment_id); setError(""); setNotice("");
    try {
      await evalRequest("/reviews", "POST", {
        orgId, assessmentId: item.assessment_id, decision, reason,
        ...(decision === "override" ? { outcome, criteria: item.criteria.map((criterion) => ({ criterion_id: criterion.criterion_id, score: scoreFor[outcome], rationale: reason })) } : {}),
      });
      setNotice(t("reviewRecorded"));
      await load();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : t("error"));
    } finally { setPending(""); }
  }

  return (
    <section aria-label={t("resultReview")}>
      <SectionHeading title={t("resultReview")}>{t("resultReviewHelp")}</SectionHeading>
      <div className="eval-toolbar"><label htmlFor="review-workspace">{t("workspace")}</label>
        <select id="review-workspace" value={orgId} onChange={(event) => setOrgId(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      {error && <Status error>{error}</Status>}
      {notice && <Status>{notice}</Status>}
      {!items ? <Loading /> : !items.length ? <EmptyState title={t("noResultsToReview")} icon={<ClipboardCheck />}><p>{t("noResultsToReviewHelp")}</p></EmptyState> : items.map((item) => (
        <article className="eval-panel" key={item.assessment_id}>
          <p className="p-row" style={{ gap: 6 }}><StatusBadge value={item.severity} /><StatusBadge value={item.outcome} /><Badge>{item.review_status.replaceAll("_", " ")}</Badge>{item.judge_reason && <Badge tone="warn">{item.judge_reason.replaceAll("_", " ")}</Badge>}</p>
          <h3>{item.case_title}</h3>
          <p className="p-cell-meta">{item.evaluation_title}</p>
          <h4>{t("input")}</h4><pre>{item.question ?? "—"}</pre>
          <h4>{t("output")}</h4><pre>{item.answer ?? "—"}</pre>
          <h4>{t("expectedBehavior")}</h4><pre>{typeof item.expected === "string" ? item.expected : JSON.stringify(item.expected, null, 2)}</pre>
          <p>{item.rationale}</p>
          {item.judge_calibration && <p className="p-cell-meta">{t("judgeCalibration")}: {item.judge_calibration.examples} {t("calibrationExamples")}{item.judge_calibration.adequate ? "" : ` · ${t("calibrationExperimental")}`}</p>}
          <div className="eval-source-refs">{item.source_refs?.map((ref) => <code key={`${ref.source_revision_id}-${ref.anchor}`}>{ref.source_revision_id}#{ref.anchor}</code>)}</div>
          <form className="p-stack" onSubmit={(event) => { event.preventDefault(); void decide(item, event.currentTarget); }}>
            <fieldset className="eval-check-list"><legend>{t("reviewDecision")}</legend>
              <label><input type="radio" name="decision" value="approve" defaultChecked /> {t("reviewApprove")}</label>
              <label><input type="radio" name="decision" value="dispute" /> {t("reviewDispute")}</label>
              <label><input type="radio" name="decision" value="override" /> {t("reviewOverride")}</label>
            </fieldset>
            <label className="eval-field"><span>{t("reviewOverrideOutcome")}</span>
              <select name="outcome" defaultValue={item.outcome}>{Object.keys(scoreFor).map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}</select>
            </label>
            <label className="eval-field"><span>{t("reviewReason")}</span><textarea name="reason" required maxLength={4000} rows={2} /></label>
            <Button className="justify-self-start" disabled={pending === item.assessment_id}>{t("recordDecision")}</Button>
          </form>
        </article>
      ))}
    </section>
  );
}
