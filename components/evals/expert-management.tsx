"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Users } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action, Card, DataTable, EmptyState, Field, PageHeading, RowTitle, SelectField,
  Stat, StatGrid, Status, StatusBadge, Tabs, Toolbar,
} from "./primitives";

type Workspace = { id: string; name: string };
type Profile = { id: string; user_id: string; domains: string[]; credentials_status: string; terms_status: string; eligibility_status: string };
type Assignment = { id: string; assigned_profile_id: string; kind: string; severity: string; status: string; review_phase: string; due_at: string | null };
type Revision = { id: string; version: number; status: string; conflict: boolean; created_at: string };
type Detail = Assignment & { revisions: Revision[] };

export function ExpertManagement({ workspaces }: { workspaces: Workspace[] }) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"assignments" | "experts">("assignments");
  const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const [amount, setAmount] = useState(""); const [note, setNote] = useState("");
  async function load() {
    if (!orgId) return;
    try {
      const [nextProfiles, nextAssignments] = await Promise.all([
        evalRequest<Profile[]>("/experts"),
        evalRequest<Assignment[]>(`/expert-assignments?orgId=${encodeURIComponent(orgId)}`),
      ]);
      setError(""); setProfiles(nextProfiles); setAssignments(nextAssignments);
    } catch { setError("Expert work could not be loaded."); }
  }
  useEffect(() => {
    let live = true;
    if (orgId) Promise.all([
      evalRequest<Profile[]>("/experts"),
      evalRequest<Assignment[]>(`/expert-assignments?orgId=${encodeURIComponent(orgId)}`),
    ]).then(([nextProfiles, nextAssignments]) => {
      if (!live) return;
      setError(""); setProfiles(nextProfiles); setAssignments(nextAssignments);
    }).catch(() => { if (live) setError("Expert work could not be loaded."); });
    return () => { live = false; };
  }, [orgId]);
  async function inspect(id: string) {
    try { setDetail(await evalRequest<Detail>(`/expert-assignments/${id}?orgId=${encodeURIComponent(orgId)}`)); }
    catch { setError("Assignment detail could not be loaded."); }
  }
  async function mutate(action: Record<string, unknown>) {
    if (!detail) return;
    try {
      await evalRequest(`/expert-assignments/${detail.id}`, "PATCH", { orgId, ...action });
      setNotice(action.action === "resolve_conflict" ? "Save conflict resolved with the selected immutable revision." : "Peer decisions are now revealed.");
      await load(); await inspect(detail.id);
    } catch { setError("The assignment could not be updated."); }
  }
  async function payment() {
    if (!detail || !amount) return;
    try {
      await evalRequest(`/expert-assignments/${detail.id}/payments`, "POST", { orgId, amount, currency: "EUR", status: "planned", note }, crypto.randomUUID());
      setAmount(""); setNote(""); setNotice("Manual payment record added. No payment was sent automatically.");
    } catch { setError("The payment record could not be added."); }
  }
  const quality = useMemo(() => profiles.map((profile) => {
    const work = assignments.filter((item) => item.assigned_profile_id === profile.id);
    const reviewed = work.filter((item) => ["approved", "rejected", "changes_requested", "adjudicated"].includes(item.status)).length;
    const gold = work.filter((item) => item.kind === "calibration" && ["approved", "rejected"].includes(item.status)).length;
    const agreement = work.filter((item) => item.status === "approved").length;
    return { profile, reviewed, gold, agreement, reliable: reviewed >= 10 && gold >= 10 };
  }), [profiles, assignments]);
  return <div className="p-stack">
    <PageHeading title="Expert work and quality">Assign redacted work, resolve preserved save conflicts, record manual payments and review quality only after enough gold work exists.</PageHeading>
    <Toolbar><SelectField id="expert-workspace" label="Client workspace" value={orgId} onChange={(event) => { setOrgId(event.target.value); setDetail(null); }}>
      {workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}
    </SelectField></Toolbar>
    {notice && <Status tone="success">{notice}</Status>}{error && <Status error>{error}</Status>}
    <Tabs value={tab} onChange={setTab} label="Expert management view" options={[{ value: "assignments", label: "Assignments" }, { value: "experts", label: "Expert quality" }]} />
    {tab === "assignments" ? assignments.length ? <DataTable caption="Expert assignments" headers={["Assignment", "Expert", "Severity", "Status", { label: "", align: "end" }]}>
      {assignments.map((item) => <tr key={item.id}><RowTitle meta={item.kind.replaceAll("_", " ")}>{item.id.slice(0, 8)}…</RowTitle><td>{item.assigned_profile_id.slice(0, 8)}…</td><td><StatusBadge value={item.severity} /></td><td><StatusBadge value={item.status} /></td><td className="p-table-action"><Action size="sm" variant="secondary" onClick={() => void inspect(item.id)}>Inspect</Action></td></tr>)}
    </DataTable> : <EmptyState title="No expert assignments" icon={<ClipboardCheck />}><p>Create a versioned guideline and assignment through the restricted operator API.</p></EmptyState> :
    profiles.length ? <div className="p-grid">{quality.map(({ profile, reviewed, gold, agreement, reliable }) => <Card title={profile.user_id} key={profile.id}>
      <div className="p-row"><StatusBadge value={profile.eligibility_status} /><StatusBadge value={profile.credentials_status} /></div>
      <StatGrid><Stat label="Reviewed" value={reviewed} /><Stat label="Gold" value={gold} /><Stat label="Agreement" value={agreement} /></StatGrid>
      {!reliable && <Status tone="info">Not enough reviewed work to rank</Status>}
    </Card>)}</div> : <EmptyState title="No expert profiles" icon={<Users />}><p>Add an eligible, verified expert through the restricted operator API.</p></EmptyState>}
    {detail && <Card title={`Assignment ${detail.id.slice(0, 8)}…`} actions={<Action variant="ghost" onClick={() => setDetail(null)}>Close</Action>}>
      <div className="p-row"><StatusBadge value={detail.status} /><StatusBadge value={detail.kind} /></div>
      {detail.status === "conflict" && <div className="p-stack"><h3>Preserved revisions</h3>{detail.revisions.map((revision) => <Toolbar key={revision.id}><span>Version {revision.version} · {revision.status}{revision.conflict ? " · competing save" : ""}</span><Action size="sm" variant="secondary" onClick={() => void mutate({ action: "resolve_conflict", revisionId: revision.id })}>Use revision {revision.version}</Action></Toolbar>)}</div>}
      {detail.review_phase === "blind" && ["independent_review", "adjudication"].includes(detail.kind) && <Action variant="secondary" onClick={() => void mutate({ action: "reveal_review" })}>Reveal peer decisions</Action>}
      <div className="p-grid p-grid-2"><Field id="payment-amount" label="Manual payment amount (EUR)" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="75.00" /><Field id="payment-note" label="Payment note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Invoice after acceptance" /></div>
      <Action variant="secondary" onClick={() => void payment()} disabled={!amount}>Add planned payment record</Action>
    </Card>}
  </div>;
}
