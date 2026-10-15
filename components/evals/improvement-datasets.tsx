"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseZap } from "lucide-react";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { evalRequest } from "./api";
import { useWorkspace } from "./workspace-context";
import {
  Action, ActionLink, Card, DataTable, EmptyState, Field, PageHeading, RowTitle,
  Loading, SelectField, Stat, StatGrid, Status, StatusBadge, Tabs, TextArea,
} from "./primitives";

type Batch = {
  id: string; project_id: string; title: string; objective: string; status: string;
  lock_version: number; task_count?: number; item_count?: number;
};
type Task = { id: string; kind: string; family_id: string; split: string };
type Item = {
  id: string; revision_id: string | null; kind: string; family_id: string; split: string;
  decision: string | null; rights_status: string | null; redaction_status: string | null;
};
type Release = {
  id: string; revision: number; status: string; artifact_id: string; content_hash: string;
  public_key_fingerprint: string;
};
type Detail = { batch: Batch; tasks: Task[]; items: Item[]; releases: Release[] };
type Split = { count: number; excluded: number; baselineScore: number | null; followupScore: number | null; delta: number | null };
type Validation = {
  training: Split; validation: Split; holdout: Split;
  causality: "observational_after_recorded_intervention"; limitations: string[];
};

const KINDS = ["grounded_qa", "corrected_response", "preference_pair", "retrieval_content"] as const;
const SPLITS = ["development", "training", "validation", "holdout"] as const;
const RIGHTS = ["customer_owned", "caudals_owned_synthetic", "caudals_owned", "licensed", "public_domain"] as const;
const DECISIONS = ["approve", "changes_requested", "reject"] as const;
const RIGHTS_STATUS = ["permitted", "pending", "restricted"] as const;
const REDACTION = ["approved", "pending", "rejected"] as const;

function pct(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }
/** A catalogue label for a stored value (`impSplit_holdout`), or the value itself when it is new. */
function choice(prefix: string, value: string) {
  const key = `${prefix}${value}` as MessageKey;
  const text = t(key);
  return text && text !== key ? text : value.replaceAll("_", " ");
}

export function ImprovementDatasets() {
  const { orgId, workspace } = useWorkspace();
  const [batches, setBatches] = useState<Batch[]>([]); const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"batches" | "build" | "validation">("batches");
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [batchForm, setBatchForm] = useState({ projectId: "", title: "", objective: "" });
  const [taskForm, setTaskForm] = useState({ findingId: "", expertAssignmentId: "", kind: "corrected_response", familyId: "", split: "training", rightsBasis: "customer_owned" });
  const [promotion, setPromotion] = useState({ taskId: "", submissionRevisionId: "" });
  const [selectedItem, setSelectedItem] = useState("");
  const [review, setReview] = useState({ reviewerProfileId: "", decision: "approve", rightsStatus: "permitted", redactionStatus: "approved", rationale: "" });
  const [followup, setFollowup] = useState({ baselineRunId: "", followupRunId: "", comparisonId: "", description: "", evidenceReference: "" });
  const [validation, setValidation] = useState<Validation | null>(null);

  const loadBatches = useCallback(async () => {
    if (!orgId) { setBatches([]); setLoading(false); return; }
    setLoading(true);
    try { setBatches(await evalRequest<Batch[]>(`/improvement-batches?orgId=${encodeURIComponent(orgId)}`)); setError(""); }
    catch (value) { setError(value instanceof Error ? value.message : t("impLoadError")); }
    finally { setLoading(false); }
  }, [orgId]);
  const inspect = useCallback(async (batchId: string) => {
    try {
      const next = await evalRequest<Detail>(`/improvement-batches/${batchId}?orgId=${encodeURIComponent(orgId)}`);
      setDetail(next); setSelectedItem(""); setValidation(null); setTab("build"); setError("");
    } catch (value) { setError(value instanceof Error ? value.message : t("impBatchLoadError")); }
  }, [orgId]);
  useEffect(() => { void loadBatches(); setDetail(null); }, [loadBatches]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true); setError("");
    try { await action(); } catch { setError(failure); } finally { setBusy(false); }
  }
  async function createBatch() {
    await run(async () => {
      const created = await evalRequest<Batch>("/improvement-batches", "POST", { orgId, ...batchForm }, crypto.randomUUID());
      setBatchForm({ projectId: "", title: "", objective: "" }); setNotice(t("impBatchCreated"));
      await loadBatches(); await inspect(created.id);
    }, t("impBatchCreateError"));
  }
  async function createTask() {
    if (!detail) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}`, "POST", { orgId, ...taskForm }, crypto.randomUUID());
      setNotice(t("impTaskCreated"));
      await inspect(detail.batch.id);
    }, t("impTaskCreateError"));
  }
  async function promote() {
    if (!detail) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}/items`, "POST", { orgId, action: "promote", ...promotion }, crypto.randomUUID());
      setNotice(t("impPromoted")); await inspect(detail.batch.id);
    }, t("impPromoteError"));
  }
  async function reviewItem() {
    if (!detail || !selectedItem) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}/items`, "POST", { orgId, action: "review", itemRevisionId: selectedItem, ...review }, crypto.randomUUID());
      setNotice(t("impReviewRecorded")); await inspect(detail.batch.id);
    }, t("impReviewError"));
  }
  const releaseCandidates = useMemo(() => detail?.items.filter((item) =>
    Boolean(item.revision_id) && item.decision === "approve" && item.rights_status === "permitted" && item.redaction_status === "approved") ?? [], [detail]);
  const releaseReady = releaseCandidates.length > 0;
  async function release() {
    if (!detail || !releaseReady) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}/release`, "POST", { orgId, expectedVersion: detail.batch.lock_version }, crypto.randomUUID());
      setNotice(t("impReleased")); await loadBatches(); await inspect(detail.batch.id);
    }, t("impReleaseError"));
  }
  async function validate() {
    if (!detail) return; const release = detail.releases[0]; if (!release) return;
    await run(async () => {
      const result = await evalRequest<{ snapshot: Validation }>(`/improvement-batches/${detail.batch.id}/validate`, "POST", {
        orgId, releaseId: release.id, ...followup, expectedVersion: detail.batch.lock_version,
      }, crypto.randomUUID());
      setValidation(result.snapshot); setNotice(t("impFollowupRecorded"));
    }, t("impFollowupError"));
  }

  return <div className="p-stack">
    <p className="p-cell-meta">{t("clientContext")} <strong>{workspace?.name ?? "—"}</strong>. {t("improvementDatasetsHelp")}</p>
    {notice && <Status tone="success">{notice}</Status>}{error && <Status error>{error}</Status>}
    <Tabs value={tab} onChange={setTab} label={t("impWorkflow")} options={[
      { value: "batches", label: t("impTabBatches") }, { value: "build", label: t("impTabBuild") }, { value: "validation", label: t("impTabFollowup") },
    ]} />

    {tab === "batches" && <div className="p-stack">
      <Card title={t("impNewBatch")}><div className="p-grid p-grid-2">
        <Field id="improvement-project" label={t("impProjectId")} value={batchForm.projectId} onChange={(event) => setBatchForm({ ...batchForm, projectId: event.target.value })} />
        <Field id="improvement-title" label={t("impBatchTitle")} value={batchForm.title} onChange={(event) => setBatchForm({ ...batchForm, title: event.target.value })} />
      </div><TextArea id="improvement-objective" label={t("impObjective")} value={batchForm.objective} onChange={(event) => setBatchForm({ ...batchForm, objective: event.target.value })} />
      <Action onClick={() => void createBatch()} disabled={busy || !batchForm.projectId || !batchForm.title}>{t("impCreateBatch")}</Action></Card>
      {loading ? <Loading>{t("impLoading")}</Loading> : error ? <Action variant="secondary" onClick={() => void loadBatches()}>{t("retry")}</Action> : batches.length ? <DataTable caption={t("impBatches")} headers={[t("impColBatch"), t("impColTasks"), t("impColItems"), t("statusLabel"), { label: "", align: "end" }]}>
        {batches.map((batch) => <tr key={batch.id}><RowTitle meta={batch.objective || t("impNoObjective")}>{batch.title}</RowTitle><td>{batch.task_count ?? 0}</td><td>{batch.item_count ?? 0}</td><td><StatusBadge value={batch.status} /></td><td className="p-table-action"><Action size="sm" variant="secondary" aria-label={tv("impOpenBatch", { title: batch.title })} onClick={() => void inspect(batch.id)}>{t("open")}</Action></td></tr>)}
      </DataTable> : <EmptyState title={t("impEmptyTitle")} icon={<DatabaseZap />}><p>{t("impEmptyBody")}</p></EmptyState>}
    </div>}

    {tab === "build" && !detail && <EmptyState title={t("impChooseBatch")} icon={<DatabaseZap />}><p>{t("impChooseBatchBody")}</p></EmptyState>}
    {tab === "build" && detail && <div className="p-stack">
      <Card title={detail.batch.title} actions={<StatusBadge value={detail.batch.status} />}><p>{detail.batch.objective}</p><StatGrid><Stat label={t("impStatTasks")} value={detail.tasks.length} /><Stat label={t("impStatItems")} value={detail.items.length} /><Stat label={t("impStatReleases")} value={detail.releases.length} /></StatGrid></Card>
      <Card title={t("impStep1")}><div className="p-grid p-grid-2">
        <Field id="task-finding" label={t("impFindingId")} value={taskForm.findingId} onChange={(event) => setTaskForm({ ...taskForm, findingId: event.target.value })} />
        <Field id="task-assignment" label={t("impAssignmentId")} value={taskForm.expertAssignmentId} onChange={(event) => setTaskForm({ ...taskForm, expertAssignmentId: event.target.value })} />
        <SelectField id="task-kind" label={t("impItemKind")} value={taskForm.kind} onChange={(event) => setTaskForm({ ...taskForm, kind: event.target.value })}>{KINDS.map((kind) => <option key={kind} value={kind}>{t(`impKind_${kind}`)}</option>)}</SelectField>
        <Field id="task-family" label={t("impCaseFamily")} value={taskForm.familyId} onChange={(event) => setTaskForm({ ...taskForm, familyId: event.target.value })} />
        <SelectField id="task-split" label={t("impSplit")} value={taskForm.split} onChange={(event) => setTaskForm({ ...taskForm, split: event.target.value })}>{SPLITS.map((split) => <option key={split} value={split}>{t(`impSplit_${split}`)}</option>)}</SelectField>
        <SelectField id="task-rights" label={t("impRights")} value={taskForm.rightsBasis} onChange={(event) => setTaskForm({ ...taskForm, rightsBasis: event.target.value })}>{RIGHTS.map((rights) => <option key={rights} value={rights}>{t(`impRights_${rights}`)}</option>)}</SelectField>
      </div><Action onClick={() => void createTask()} disabled={busy || !taskForm.findingId || !taskForm.expertAssignmentId || !taskForm.familyId}>{t("impCreateTask")}</Action></Card>
      <Card title={t("impStep2")}><div className="p-grid p-grid-2"><Field id="promotion-task" label={t("impTaskId")} value={promotion.taskId} onChange={(event) => setPromotion({ ...promotion, taskId: event.target.value })} /><Field id="promotion-submission" label={t("impSubmissionId")} value={promotion.submissionRevisionId} onChange={(event) => setPromotion({ ...promotion, submissionRevisionId: event.target.value })} /></div><Action variant="secondary" onClick={() => void promote()} disabled={busy || !promotion.taskId || !promotion.submissionRevisionId}>{t("impPromote")}</Action></Card>
      <Card title={t("impStep3")}>
        {detail.items.length ? <DataTable caption={t("impQualityGates")} headers={[t("impColItem"), t("impColSplit"), t("impColReview"), t("impColRights"), t("impColRedaction")]}>{detail.items.map((item) => <tr key={item.id}><th scope="row"><label className="p-check"><input type="checkbox" aria-label={tv("impSelectItem", { item: item.family_id })} checked={selectedItem === item.revision_id} disabled={!item.revision_id || item.decision === "reject"} onChange={() => setSelectedItem(selectedItem === item.revision_id ? "" : item.revision_id ?? "")} /><span><strong>{item.family_id}</strong><small>{choice("impKind_", item.kind)}</small></span></label></th><td>{choice("impSplit_", item.split)}</td><td><StatusBadge value={item.decision} fallback={t("impNotReviewed")} /></td><td><StatusBadge value={item.rights_status} fallback={t("impPending")} /></td><td><StatusBadge value={item.redaction_status} fallback={t("impPending")} /></td></tr>)}</DataTable> : <Status tone="info">{t("impNoItems")}</Status>}
        <div className="p-grid p-grid-2"><Field id="reviewer-profile" label={t("impReviewerId")} value={review.reviewerProfileId} onChange={(event) => setReview({ ...review, reviewerProfileId: event.target.value })} /><SelectField id="item-decision" label={t("impDecision")} value={review.decision} onChange={(event) => setReview({ ...review, decision: event.target.value })}>{DECISIONS.map((decision) => <option key={decision} value={decision}>{t(`impDecision_${decision}`)}</option>)}</SelectField><SelectField id="item-rights" label={t("impRightsDecision")} value={review.rightsStatus} onChange={(event) => setReview({ ...review, rightsStatus: event.target.value })}>{RIGHTS_STATUS.map((status) => <option key={status} value={status}>{t(`impRightsStatus_${status}`)}</option>)}</SelectField><SelectField id="item-redaction" label={t("impRedactionDecision")} value={review.redactionStatus} onChange={(event) => setReview({ ...review, redactionStatus: event.target.value })}>{REDACTION.map((status) => <option key={status} value={status}>{t(`impRedaction_${status}`)}</option>)}</SelectField></div>
        <TextArea id="item-rationale" label={t("impRationale")} value={review.rationale} onChange={(event) => setReview({ ...review, rationale: event.target.value })} /><Action variant="secondary" onClick={() => void reviewItem()} disabled={busy || !selectedItem || !review.reviewerProfileId || !review.rationale}>{t("impRecordReview")}</Action>
      </Card>
      <Card title={t("impStep4")}><div className="p-stack"><Status tone={releaseReady ? "success" : "warn"}>{releaseReady ? tv("impEligible", { eligible: releaseCandidates.length, excluded: detail.items.length - releaseCandidates.length }) : t("impReleaseRequires")}</Status><p>{t("impReleaseHelp")}</p><Action onClick={() => void release()} disabled={busy || !releaseReady}>{t("impRelease")}</Action></div></Card>
      {detail.releases.map((releaseRow) => <Card title={tv("impSignedRelease", { n: releaseRow.revision })} key={releaseRow.id} actions={<StatusBadge value={releaseRow.status} />}><p>{t("impContentHash")} <code>{releaseRow.content_hash}</code></p><p>{t("impFingerprint")} <code>{releaseRow.public_key_fingerprint}</code></p><ActionLink href={`/api/evals/v1/dataset-artifacts/${releaseRow.artifact_id}?orgId=${encodeURIComponent(orgId)}`} variant="secondary">{t("impDownload")}</ActionLink><Status tone="warn">{t("impExportWarning")}</Status></Card>)}
    </div>}

    {tab === "validation" && !detail && <EmptyState title={t("impChooseReleased")} icon={<DatabaseZap />}><p>{t("impChooseReleasedBody")}</p></EmptyState>}
    {tab === "validation" && detail && <div className="p-stack"><Card title={t("impFollowupTitle")}><p>{t("impFollowupHelp")}</p><div className="p-grid p-grid-2"><Field id="baseline-run" label={t("impBaselineRun")} value={followup.baselineRunId} onChange={(event) => setFollowup({ ...followup, baselineRunId: event.target.value })} /><Field id="followup-run" label={t("impFollowupRun")} value={followup.followupRunId} onChange={(event) => setFollowup({ ...followup, followupRunId: event.target.value })} /><Field id="comparison-id" label={t("impComparisonId")} value={followup.comparisonId} onChange={(event) => setFollowup({ ...followup, comparisonId: event.target.value })} /><Field id="evidence-reference" label={t("impEvidenceRef")} value={followup.evidenceReference} onChange={(event) => setFollowup({ ...followup, evidenceReference: event.target.value })} /></div><TextArea id="intervention-description" label={t("impIntervention")} value={followup.description} onChange={(event) => setFollowup({ ...followup, description: event.target.value })} /><Action onClick={() => void validate()} disabled={busy || !detail.releases.length || Object.values(followup).some((value) => !value)}>{t("impRecordFollowup")}</Action></Card>
      {validation && <Card title={t("impObserved")}><div className="p-grid">{([
        ["training", validation.training], ["validation", validation.validation], ["holdout", validation.holdout],
      ] as const).map(([split, result]) => <Stat key={split} label={t(`impSplit_${split}`)} value={pct(result.delta)} meta={tv("impSplitMeta", { count: result.count, before: pct(result.baselineScore), after: pct(result.followupScore), excluded: result.excluded })} />)}</div><Status tone="info">{validation.limitations.join(" ")}</Status></Card>}
    </div>}
  </div>;
}
