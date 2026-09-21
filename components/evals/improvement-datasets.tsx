"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseZap } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action, ActionLink, Card, DataTable, EmptyState, Field, PageHeading, RowTitle,
  SelectField, Stat, StatGrid, Status, StatusBadge, Tabs, TextArea, Toolbar,
} from "./primitives";

type Workspace = { id: string; name: string };
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

function pct(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }

export function ImprovementDatasets({ workspaces }: { workspaces: Workspace[] }) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const [batches, setBatches] = useState<Batch[]>([]); const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"batches" | "build" | "validation">("batches");
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [batchForm, setBatchForm] = useState({ projectId: "", title: "", objective: "" });
  const [taskForm, setTaskForm] = useState({ findingId: "", expertAssignmentId: "", kind: "corrected_response", familyId: "", split: "training", rightsBasis: "customer_owned" });
  const [promotion, setPromotion] = useState({ taskId: "", submissionRevisionId: "" });
  const [selectedItem, setSelectedItem] = useState("");
  const [review, setReview] = useState({ reviewerProfileId: "", decision: "approve", rightsStatus: "permitted", redactionStatus: "approved", rationale: "" });
  const [followup, setFollowup] = useState({ baselineRunId: "", followupRunId: "", comparisonId: "", description: "", evidenceReference: "" });
  const [validation, setValidation] = useState<Validation | null>(null);

  const loadBatches = useCallback(async () => {
    if (!orgId) return;
    try { setBatches(await evalRequest<Batch[]>(`/improvement-batches?orgId=${encodeURIComponent(orgId)}`)); setError(""); }
    catch { setError("Improvement datasets could not be loaded."); }
  }, [orgId]);
  const inspect = useCallback(async (batchId: string) => {
    try {
      const next = await evalRequest<Detail>(`/improvement-batches/${batchId}?orgId=${encodeURIComponent(orgId)}`);
      setDetail(next); setSelectedItem(""); setValidation(null); setTab("build"); setError("");
    } catch { setError("The improvement batch could not be loaded."); }
  }, [orgId]);
  useEffect(() => { void loadBatches(); setDetail(null); }, [loadBatches]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true); setError("");
    try { await action(); } catch { setError(failure); } finally { setBusy(false); }
  }
  async function createBatch() {
    await run(async () => {
      const created = await evalRequest<Batch>("/improvement-batches", "POST", { orgId, ...batchForm }, crypto.randomUUID());
      setBatchForm({ projectId: "", title: "", objective: "" }); setNotice("Improvement batch created. No customer system was changed.");
      await loadBatches(); await inspect(created.id);
    }, "The improvement batch could not be created.");
  }
  async function createTask() {
    if (!detail) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}`, "POST", { orgId, ...taskForm }, crypto.randomUUID());
      setNotice("Finding-linked expert task created. This records work only; it does not modify the customer system.");
      await inspect(detail.batch.id);
    }, "The improvement task could not be created.");
  }
  async function promote() {
    if (!detail) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}/items`, "POST", { orgId, action: "promote", ...promotion }, crypto.randomUUID());
      setNotice("The independently approved submission was promoted to a draft dataset item."); await inspect(detail.batch.id);
    }, "Only an independently approved expert submission can be promoted.");
  }
  async function reviewItem() {
    if (!detail || !selectedItem) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}/items`, "POST", { orgId, action: "review", itemRevisionId: selectedItem, ...review }, crypto.randomUUID());
      setNotice("Dataset item review recorded with rights and redaction decisions."); await inspect(detail.batch.id);
    }, "The dataset item review could not be recorded.");
  }
  const releaseCandidates = useMemo(() => detail?.items.filter((item) =>
    Boolean(item.revision_id) && item.decision === "approve" && item.rights_status === "permitted" && item.redaction_status === "approved") ?? [], [detail]);
  const releaseReady = releaseCandidates.length > 0;
  async function release() {
    if (!detail || !releaseReady) return;
    await run(async () => {
      await evalRequest(`/improvement-batches/${detail.batch.id}/release`, "POST", { orgId, expectedVersion: detail.batch.lock_version }, crypto.randomUUID());
      setNotice("Signed dataset released to private storage."); await loadBatches(); await inspect(detail.batch.id);
    }, "The signed dataset could not be released. Refresh and recheck every approval gate.");
  }
  async function validate() {
    if (!detail) return; const release = detail.releases[0]; if (!release) return;
    await run(async () => {
      const result = await evalRequest<{ snapshot: Validation }>(`/improvement-batches/${detail.batch.id}/validate`, "POST", {
        orgId, releaseId: release.id, ...followup, expectedVersion: detail.batch.lock_version,
      }, crypto.randomUUID());
      setValidation(result.snapshot); setNotice("Follow-up evidence recorded without making a new system call.");
    }, "Follow-up evidence requires matched runs and a compatible comparison.");
  }

  return <div className="p-stack">
    <PageHeading title="Improvement datasets">Turn reviewed findings into traceable, rights-checked data releases, then measure observed changes on separate training, validation and held-out cases.</PageHeading>
    <Toolbar><SelectField id="improvement-workspace" label="Client workspace" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
      {workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}
    </SelectField></Toolbar>
    {notice && <Status tone="success">{notice}</Status>}{error && <Status error>{error}</Status>}
    <Tabs value={tab} onChange={setTab} label="Improvement dataset workflow" options={[
      { value: "batches", label: "Batches" }, { value: "build", label: "Build and QA" }, { value: "validation", label: "Follow-up evidence" },
    ]} />

    {tab === "batches" && <div className="p-stack">
      <Card title="New improvement batch"><div className="p-grid p-grid-2">
        <Field id="improvement-project" label="Project ID" value={batchForm.projectId} onChange={(event) => setBatchForm({ ...batchForm, projectId: event.target.value })} />
        <Field id="improvement-title" label="Batch title" value={batchForm.title} onChange={(event) => setBatchForm({ ...batchForm, title: event.target.value })} />
      </div><TextArea id="improvement-objective" label="Objective" value={batchForm.objective} onChange={(event) => setBatchForm({ ...batchForm, objective: event.target.value })} />
      <Action onClick={() => void createBatch()} disabled={busy || !batchForm.projectId || !batchForm.title}>Create improvement batch</Action></Card>
      {batches.length ? <DataTable caption="Improvement batches" headers={["Batch", "Tasks", "Items", "Status", { label: "", align: "end" }]}>
        {batches.map((batch) => <tr key={batch.id}><RowTitle meta={batch.objective || "No objective recorded"}>{batch.title}</RowTitle><td>{batch.task_count ?? 0}</td><td>{batch.item_count ?? 0}</td><td><StatusBadge value={batch.status} /></td><td className="p-table-action"><Action size="sm" variant="secondary" aria-label={`Open ${batch.title}`} onClick={() => void inspect(batch.id)}>Open</Action></td></tr>)}
      </DataTable> : <EmptyState title="No improvement batches" icon={<DatabaseZap />}><p>Create a finding-linked batch after an evaluation has identified evidence-backed work.</p></EmptyState>}
    </div>}

    {tab === "build" && !detail && <EmptyState title="Choose an improvement batch" icon={<DatabaseZap />}><p>Open a batch to create work, promote approved submissions, review items and release a signed artifact.</p></EmptyState>}
    {tab === "build" && detail && <div className="p-stack">
      <Card title={detail.batch.title} actions={<StatusBadge value={detail.batch.status} />}><p>{detail.batch.objective}</p><StatGrid><Stat label="Finding-linked tasks" value={detail.tasks.length} /><Stat label="Dataset items" value={detail.items.length} /><Stat label="Signed releases" value={detail.releases.length} /></StatGrid></Card>
      <Card title="1. Create finding-linked expert work"><div className="p-grid p-grid-2">
        <Field id="task-finding" label="Finding ID" value={taskForm.findingId} onChange={(event) => setTaskForm({ ...taskForm, findingId: event.target.value })} />
        <Field id="task-assignment" label="Approved expert assignment ID" value={taskForm.expertAssignmentId} onChange={(event) => setTaskForm({ ...taskForm, expertAssignmentId: event.target.value })} />
        <SelectField id="task-kind" label="Dataset item kind" value={taskForm.kind} onChange={(event) => setTaskForm({ ...taskForm, kind: event.target.value })}><option value="grounded_qa">Grounded Q&amp;A</option><option value="corrected_response">Corrected response</option><option value="preference_pair">Preference pair</option><option value="retrieval_content">Retrieval content</option></SelectField>
        <Field id="task-family" label="Case family" value={taskForm.familyId} onChange={(event) => setTaskForm({ ...taskForm, familyId: event.target.value })} />
        <SelectField id="task-split" label="Data split" value={taskForm.split} onChange={(event) => setTaskForm({ ...taskForm, split: event.target.value })}><option value="development">Development</option><option value="training">Training</option><option value="validation">Validation</option><option value="holdout">Held-out</option></SelectField>
        <SelectField id="task-rights" label="Rights basis" value={taskForm.rightsBasis} onChange={(event) => setTaskForm({ ...taskForm, rightsBasis: event.target.value })}><option value="customer_owned">Customer owned</option><option value="caudals_owned_synthetic">Caudals-owned synthetic</option><option value="caudals_owned">Caudals owned</option><option value="licensed">Licensed</option><option value="public_domain">Public domain</option></SelectField>
      </div><Action onClick={() => void createTask()} disabled={busy || !taskForm.findingId || !taskForm.expertAssignmentId || !taskForm.familyId}>Create expert task</Action></Card>
      <Card title="2. Promote independently approved work"><div className="p-grid p-grid-2"><Field id="promotion-task" label="Improvement task ID" value={promotion.taskId} onChange={(event) => setPromotion({ ...promotion, taskId: event.target.value })} /><Field id="promotion-submission" label="Approved submission revision ID" value={promotion.submissionRevisionId} onChange={(event) => setPromotion({ ...promotion, submissionRevisionId: event.target.value })} /></div><Action variant="secondary" onClick={() => void promote()} disabled={busy || !promotion.taskId || !promotion.submissionRevisionId}>Promote approved submission</Action></Card>
      <Card title="3. Dataset item QA">
        {detail.items.length ? <DataTable caption="Dataset item quality gates" headers={["Item", "Split", "Review", "Rights", "Redaction"]}>{detail.items.map((item) => <tr key={item.id}><th scope="row"><label className="p-check"><input type="checkbox" aria-label={`Select ${item.family_id}`} checked={selectedItem === item.revision_id} disabled={!item.revision_id || item.decision === "reject"} onChange={() => setSelectedItem(selectedItem === item.revision_id ? "" : item.revision_id ?? "")} /><span><strong>{item.family_id}</strong><small>{item.kind.replaceAll("_", " ")}</small></span></label></th><td>{item.split === "holdout" ? "Held-out" : item.split}</td><td><StatusBadge value={item.decision} fallback="Not reviewed" /></td><td><StatusBadge value={item.rights_status} fallback="Pending" /></td><td><StatusBadge value={item.redaction_status} fallback="Pending" /></td></tr>)}</DataTable> : <Status tone="info">No promoted dataset items yet.</Status>}
        <div className="p-grid p-grid-2"><Field id="reviewer-profile" label="Independent reviewer profile ID" value={review.reviewerProfileId} onChange={(event) => setReview({ ...review, reviewerProfileId: event.target.value })} /><SelectField id="item-decision" label="QA decision" value={review.decision} onChange={(event) => setReview({ ...review, decision: event.target.value })}><option value="approve">Approve</option><option value="changes_requested">Request changes</option><option value="reject">Reject</option></SelectField><SelectField id="item-rights" label="Rights decision" value={review.rightsStatus} onChange={(event) => setReview({ ...review, rightsStatus: event.target.value })}><option value="permitted">Permitted</option><option value="pending">Pending</option><option value="restricted">Restricted</option></SelectField><SelectField id="item-redaction" label="Redaction decision" value={review.redactionStatus} onChange={(event) => setReview({ ...review, redactionStatus: event.target.value })}><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></SelectField></div>
        <TextArea id="item-rationale" label="QA rationale" value={review.rationale} onChange={(event) => setReview({ ...review, rationale: event.target.value })} /><Action variant="secondary" onClick={() => void reviewItem()} disabled={busy || !selectedItem || !review.reviewerProfileId || !review.rationale}>Record item review</Action>
      </Card>
      <Card title="4. Release checklist"><div className="p-stack"><Status tone={releaseReady ? "success" : "warn"}>{releaseReady ? `${releaseCandidates.length} item${releaseCandidates.length === 1 ? " is" : "s are"} eligible. ${detail.items.length - releaseCandidates.length} unapproved or restricted item${detail.items.length - releaseCandidates.length === 1 ? " is" : "s are"} excluded.` : "Release requires independent approval, permitted rights and approved redaction on at least one item."}</Status><p>Release creates a frozen, signed JSONL artifact in private storage. Rejected, pending and restricted items are excluded. Creating work or releasing data never changes the customer&apos;s system.</p><Action onClick={() => void release()} disabled={busy || !releaseReady}>Release signed dataset</Action></div></Card>
      {detail.releases.map((releaseRow) => <Card title={`Signed release ${releaseRow.revision}`} key={releaseRow.id} actions={<StatusBadge value={releaseRow.status} />}><p>Content hash <code>{releaseRow.content_hash}</code></p><p>Signing fingerprint <code>{releaseRow.public_key_fingerprint}</code></p><ActionLink href={`/api/evals/v1/dataset-artifacts/${releaseRow.artifact_id}?orgId=${encodeURIComponent(orgId)}`} variant="secondary">Download signed JSONL</ActionLink><Status tone="warn">Exported files cannot be revoked after download. Share them only through an approved customer channel.</Status></Card>)}
    </div>}

    {tab === "validation" && !detail && <EmptyState title="Choose a released batch" icon={<DatabaseZap />}><p>Open a batch before recording the customer intervention and follow-up evidence.</p></EmptyState>}
    {tab === "validation" && detail && <div className="p-stack"><Card title="Recorded intervention and follow-up"><p>This step compares existing matched runs. It does not call or modify the customer system.</p><div className="p-grid p-grid-2"><Field id="baseline-run" label="Baseline run ID" value={followup.baselineRunId} onChange={(event) => setFollowup({ ...followup, baselineRunId: event.target.value })} /><Field id="followup-run" label="Follow-up run ID" value={followup.followupRunId} onChange={(event) => setFollowup({ ...followup, followupRunId: event.target.value })} /><Field id="comparison-id" label="Compatible comparison ID" value={followup.comparisonId} onChange={(event) => setFollowup({ ...followup, comparisonId: event.target.value })} /><Field id="evidence-reference" label="Intervention evidence reference" value={followup.evidenceReference} onChange={(event) => setFollowup({ ...followup, evidenceReference: event.target.value })} /></div><TextArea id="intervention-description" label="Recorded customer intervention" value={followup.description} onChange={(event) => setFollowup({ ...followup, description: event.target.value })} /><Action onClick={() => void validate()} disabled={busy || !detail.releases.length || Object.values(followup).some((value) => !value)}>Record follow-up evidence</Action></Card>
      {validation && <Card title="Observed before/after evidence"><div className="p-grid">{([
        ["Training", validation.training], ["Validation", validation.validation], ["Held-out", validation.holdout],
      ] as const).map(([label, result]) => <Stat key={label} label={label} value={pct(result.delta)} meta={`${result.count} matched · ${pct(result.baselineScore)} to ${pct(result.followupScore)} · ${result.excluded} excluded`} />)}</div><Status tone="info">{validation.limitations.join(" ")}</Status></Card>}
    </div>}
  </div>;
}
