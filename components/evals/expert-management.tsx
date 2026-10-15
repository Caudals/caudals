"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Users } from "lucide-react";
import { evalRequest } from "./api";
import { useWorkspace } from "./workspace-context";
import { SidePanel } from "./overlays";
import { ExpertBench, ReviewRequestList } from "./expert-reviews";
import { t } from "@/lib/evals/messages/runtime";
import {
  Action, Card, DataTable, EmptyState, Field, PageHeading, RowTitle,
  Stat, StatGrid, Status, StatusBadge, Tabs, Toolbar,
} from "./primitives";

type Profile = { id: string; user_id: string; domains: string[]; credentials_status: string; terms_status: string; eligibility_status: string };
type Assignment = { id: string; assigned_profile_id: string; kind: string; severity: string; status: string; review_phase: string; due_at: string | null };
type Revision = { id: string; version: number; status: string; conflict: boolean; created_at: string };
type Detail = Assignment & { revisions: Revision[] };

/** `reviewOrders`: EXPERT_REVIEW_ORDERS_ENABLED, read on the server (launch L-26): review requests and the expert bench. */
export function ExpertManagement({ reviewOrders = false }: { reviewOrders?: boolean }) {
  const { orgId, workspace } = useWorkspace();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"requests" | "assignments" | "experts" | "bench">(reviewOrders ? "requests" : "assignments");
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
    } catch { setError(t("expertWorkLoadFailed")); }
  }
  useEffect(() => {
    let live = true;
    if (orgId) Promise.all([
      evalRequest<Profile[]>("/experts"),
      evalRequest<Assignment[]>(`/expert-assignments?orgId=${encodeURIComponent(orgId)}`),
    ]).then(([nextProfiles, nextAssignments]) => {
      if (!live) return;
      setError(""); setProfiles(nextProfiles); setAssignments(nextAssignments);
    }).catch(() => { if (live) setError(t("expertWorkLoadFailed")); });
    return () => { live = false; };
  }, [orgId]);
  async function inspect(id: string, fresh = true) {
    if (fresh) { setNotice(""); setError(""); }
    try { setDetail(await evalRequest<Detail>(`/expert-assignments/${id}?orgId=${encodeURIComponent(orgId)}`)); }
    catch { setError(t("expertAssignmentLoadFailed")); }
  }
  async function mutate(action: Record<string, unknown>) {
    if (!detail) return;
    try {
      await evalRequest(`/expert-assignments/${detail.id}`, "PATCH", { orgId, ...action });
      setNotice(action.action === "resolve_conflict" ? t("expertConflictResolved") : t("expertPeersRevealed"));
      await load(); await inspect(detail.id, false);
    } catch { setError(t("expertAssignmentUpdateFailed")); }
  }
  async function payment() {
    if (!detail || !amount) return;
    try {
      await evalRequest(`/expert-assignments/${detail.id}/payments`, "POST", { orgId, amount, currency: "EUR", status: "planned", note }, crypto.randomUUID());
      setAmount(""); setNote(""); setNotice(t("expertPaymentAdded"));
    } catch { setError(t("expertPaymentFailed")); }
  }
  const quality = useMemo(() => profiles.map((profile) => {
    const work = assignments.filter((item) => item.assigned_profile_id === profile.id);
    const reviewed = work.filter((item) => ["approved", "rejected", "changes_requested", "adjudicated"].includes(item.status)).length;
    const gold = work.filter((item) => item.kind === "calibration" && ["approved", "rejected"].includes(item.status)).length;
    const agreement = work.filter((item) => item.status === "approved").length;
    return { profile, reviewed, gold, agreement, reliable: reviewed >= 10 && gold >= 10 };
  }), [profiles, assignments]);
  return <div className="p-stack">
    <PageHeading title={t("expertWork")} meta={<span>{t("clientContext")} <strong>{workspace?.name ?? "—"}</strong></span>}>{t("expertWorkIntro")}</PageHeading>
    {!detail && notice && <Status tone="success">{notice}</Status>}{!detail && error && <Status error>{error}</Status>}
    <Tabs value={tab} onChange={setTab} label={t("expertViewLabel")} options={[
      ...(reviewOrders ? [{ value: "requests" as const, label: t("erTabRequests") }] : []),
      { value: "assignments" as const, label: t("expertTabAssignments") }, { value: "experts" as const, label: t("expertTabQuality") },
      ...(reviewOrders ? [{ value: "bench" as const, label: t("erTabBench") }] : []),
    ]} />
    {tab === "requests" ? <ReviewRequestList /> : tab === "bench" ? <ExpertBench /> : tab === "assignments" ? assignments.length ? <DataTable caption={t("expertAssignmentsCaption")} headers={[t("expertColAssignment"), t("expertColExpert"), t("expertColSeverity"), t("expertColStatus"), { label: "", align: "end" }]}>
      {assignments.map((item) => <tr key={item.id}><RowTitle meta={item.kind.replaceAll("_", " ")}>{item.id.slice(0, 8)}…</RowTitle><td>{item.assigned_profile_id.slice(0, 8)}…</td><td><StatusBadge value={item.severity} /></td><td><StatusBadge value={item.status} /></td><td className="p-table-action"><Action size="sm" variant="secondary" onClick={() => void inspect(item.id)}>{t("expertInspect")}</Action></td></tr>)}
    </DataTable> : <EmptyState title={t("expertNoAssignments")} icon={<ClipboardCheck />}><p>{t("expertNoAssignmentsHelp")}</p></EmptyState> :
    profiles.length ? <div className="p-grid">{quality.map(({ profile, reviewed, gold, agreement, reliable }) => <Card title={profile.user_id} key={profile.id}>
      <div className="p-row"><StatusBadge value={profile.eligibility_status} /><StatusBadge value={profile.credentials_status} /></div>
      <StatGrid><Stat label={t("expertStatReviewed")} value={reviewed} /><Stat label={t("expertStatGold")} value={gold} /><Stat label={t("expertStatAgreement")} value={agreement} /></StatGrid>
      {!reliable && <Status tone="info">{t("expertNotRanked")}</Status>}
    </Card>)}</div> : <EmptyState title={t("expertNoProfiles")} icon={<Users />}><p>{t("expertNoProfilesHelp")}</p></EmptyState>}
    <SidePanel open={!!detail} onOpenChange={(value) => { if (!value) setDetail(null); }} title={detail ? `${t("expertAssignmentTitle")} ${detail.id.slice(0, 8)}…` : t("expertAssignmentTitle")}>{detail && <div className="p-stack">
      {notice && <Status tone="success">{notice}</Status>}{error && <Status error>{error}</Status>}
      <div className="p-row"><StatusBadge value={detail.status} /><StatusBadge value={detail.kind} /></div>
      {detail.status === "conflict" && <div className="p-stack"><h3>{t("expertPreservedRevisions")}</h3>{detail.revisions.map((revision) => <Toolbar key={revision.id}><span>{t("expertVersion")} {revision.version} · {revision.status}{revision.conflict ? ` · ${t("expertCompetingSave")}` : ""}</span><Action size="sm" variant="secondary" onClick={() => void mutate({ action: "resolve_conflict", revisionId: revision.id })}>{t("expertUseRevision")} {revision.version}</Action></Toolbar>)}</div>}
      {detail.review_phase === "blind" && ["independent_review", "adjudication"].includes(detail.kind) && <Action variant="secondary" onClick={() => void mutate({ action: "reveal_review" })}>{t("expertRevealPeers")}</Action>}
      <div className="p-grid p-grid-2"><Field id="payment-amount" label={t("expertPaymentAmount")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="75.00" /><Field id="payment-note" label={t("expertPaymentNote")} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("expertPaymentNotePlaceholder")} /></div>
      <Action variant="secondary" onClick={() => void payment()} disabled={!amount}>{t("expertAddPayment")}</Action>
    </div>}</SidePanel>
  </div>;
}
