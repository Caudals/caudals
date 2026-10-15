"use client";

/**
 * Upgrade moments (launch L-14, spec v2 P-09, §6.5): when an action hits a
 * plan limit, the API answers with a typed PLAN_LIMIT_* error (only where plans
 * v2 applies to the workspace) and `evalRequest` announces it. The host below,
 * mounted once in the shell, opens a dialog that names the limit, shows where
 * the workspace stands, and says what credits (pay as you go) or a managed plan
 * unlock, with "Add credits" and "Talk to us". The plan details come from
 * GET /billing/plan, which answers 404 while plans v2 is off for the workspace.
 */
import { useEffect, useState } from "react";
import { CalendarDays, CreditCard } from "lucide-react";
import { evalRequest, EvalRequestError, PLAN_LIMIT_EVENT, type PlanLimitEventDetail } from "./api";
import { ActionAnchor, ActionLink, Loading, Status } from "./primitives";
import { Modal } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { connectionLabel } from "./workspace-data";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { localizePathname } from "@/lib/i18n/routing";
import type { Plan, PlanLimitKind, Unlock } from "@/lib/billing/plans";

/** GET /api/evals/v1/billing/plan (lib/billing/plan-summary.ts). */
export type PlanSummaryView = {
  orgId: string;
  plan: Plan;
  role: string | null;
  limits: {
    systems: { used: number; limit: number | null };
    questionsPerSet: { limit: number | null };
    runsPerMonth: { used: number; limit: number | null };
    activeRuns: { used: number; limit: number };
    members: { used: number; pending: number; limit: number | null };
    connectionTypes: string[];
    schedules: boolean;
    exports: boolean;
  };
  payg: { systems: number | null; questionsPerSet: number | null; runsPerMonth: number | null; activeRuns: number; members: number | null; connectionTypes: string[]; schedules: boolean };
  unlocks: Record<PlanLimitKind, Unlock>;
  connectionUnlocks: Record<string, Unlock>;
  allowance: { monthlyCredits: number; period: string; granted: boolean; expiresAt: string | null } | null;
  credits: { available: number; held: number; billingMode: string } | null;
  actions: { addCreditsUrl: string | null; talkToUsUrl: string };
};

function isPlanSummary(value: unknown): value is PlanSummaryView {
  const candidate = value as Partial<PlanSummaryView> | null;
  return !!candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate.plan === "string"
    && !!candidate.limits && !!candidate.unlocks && !!candidate.connectionUnlocks && !!candidate.actions;
}

/**
 * The workspace's plan summary, or null while loading, when plans v2 is off
 * for the workspace (404) or on any error: callers then keep today's screens.
 */
export function usePlanSummary(orgId: string, enabled = true) {
  const [state, setState] = useState<{ orgId: string; plan: PlanSummaryView | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!orgId || !enabled) return;
    let live = true;
    evalRequest<unknown>(`/billing/plan?orgId=${encodeURIComponent(orgId)}`).then(
      plan => { if (live) setState({ orgId, plan: isPlanSummary(plan) ? plan : null, failed: !isPlanSummary(plan) }); },
      error => { if (live) setState({ orgId, plan: null, failed: !(error instanceof EvalRequestError && error.status === 404) }); },
    );
    return () => { live = false; };
  }, [orgId, enabled]);
  const current = state?.orgId === orgId ? state : null;
  return { plan: current?.plan ?? null, loaded: current !== null, failed: current?.failed ?? false };
}

/** Opens the upgrade dialog from a control (a locked card, a "See what unlocks it" link). */
export function openLimitDialog(kind: PlanLimitKind, connectionType: string | null = null) {
  window.dispatchEvent(new CustomEvent<PlanLimitEventDetail>(PLAN_LIMIT_EVENT, { detail: { kind, connectionType, limit: null } }));
}

/** Mounted once in the shell: opens the dialog for every typed limit the API reports. */
export function LimitDialogHost() {
  const { orgId } = useWorkspace();
  const [open, setOpen] = useState<PlanLimitEventDetail | null>(null);
  useEffect(() => {
    const onLimit = (event: Event) => {
      const detail = (event as CustomEvent<PlanLimitEventDetail>).detail;
      if (detail?.kind) setOpen(detail);
    };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, []);
  if (!open || !orgId) return null;
  return <LimitDialog orgId={orgId} kind={open.kind} connectionType={open.connectionType} onClose={() => setOpen(null)} />;
}

const PLAN_LABEL: Record<Plan, MessageKey> = { free: "limitPlan_free", payg: "limitPlan_payg", managed: "limitPlan_managed", partner: "limitPlan_partner" };

/** Where the workspace stands on the limit, in one line. */
function currentLine(plan: PlanSummaryView, kind: PlanLimitKind): string {
  const { limits } = plan;
  const of = (value: number | null) => (value === null ? "—" : String(value));
  switch (kind) {
    case "systems": return tv("limitNow_systems", { used: limits.systems.used, limit: of(limits.systems.limit) });
    case "runs": return tv("limitNow_runs", { used: limits.runsPerMonth.used, limit: of(limits.runsPerMonth.limit) });
    case "questions": return tv("limitNow_questions", { limit: of(limits.questionsPerSet.limit) });
    case "connection": return tv("limitNow_connection", { list: [...new Set(limits.connectionTypes.map(connectionLabel))].join(", ") });
    case "schedules": return t("limitNow_schedules");
    case "members": return tv("limitNow_members", { used: limits.members.used + limits.members.pending, limit: of(limits.members.limit) });
  }
}

/** What pay as you go adds for this limit. */
function creditsLine(plan: PlanSummaryView, kind: PlanLimitKind): string {
  const { payg } = plan;
  switch (kind) {
    case "systems": return tv("limitCredits_systems", { n: payg.systems ?? "—" });
    case "runs": return t("limitCredits_runs");
    case "questions": return tv("limitCredits_questions", { n: payg.questionsPerSet ?? "—" });
    case "connection": return t("limitCredits_connection");
    case "schedules": return t("limitCredits_schedules");
    case "members": return tv("limitCredits_members", { n: payg.members ?? "—" });
  }
}

export function LimitDialog({ orgId, kind, connectionType = null, onClose }: { orgId: string; kind: PlanLimitKind; connectionType?: string | null; onClose: () => void }) {
  const { plan, loaded, failed } = usePlanSummary(orgId);
  const unlock: Unlock | null = plan
    ? kind === "connection" && connectionType ? plan.connectionUnlocks[connectionType] ?? plan.unlocks.connection : plan.unlocks[kind]
    : null;
  const credits = unlock === "credits";
  const addCredits = credits ? plan?.actions.addCreditsUrl ?? null : null;
  // The booking page; without the plan details, the public one.
  const talk = loaded ? plan?.actions.talkToUsUrl ?? new URL(localizePathname("/call", getLocale()), "https://caudals.com").toString() : null;
  return (
    <Modal
      open
      onOpenChange={value => { if (!value) onClose(); }}
      title={t(`limitTitle_${kind}` as MessageKey)}
      description={t("limitDescription")}
      footer={
        <>
          {talk && (
            <ActionAnchor variant={addCredits ? "secondary" : "primary"} href={talk} target="_blank" rel="noopener noreferrer">
              <CalendarDays aria-hidden="true" />
              {t("limitTalkToUs")}
            </ActionAnchor>
          )}
          {addCredits && (
            <ActionLink href={addCredits}>
              <CreditCard aria-hidden="true" />
              {t("limitAddCredits")}
            </ActionLink>
          )}
        </>
      }
    >
      {!loaded ? (
        <Loading>{t("billingLoading")}</Loading>
      ) : !plan ? (
        <Status tone={failed ? "error" : "info"}>{t("limitUnavailable")}</Status>
      ) : (
        <div className="p-limit">
          <p className="p-limit-now">
            <span className="p-limit-plan">{t("limitYourPlan")}: {t(PLAN_LABEL[plan.plan])}</span>
            <span>{currentLine(plan, kind)}</span>
          </p>
          <div className="p-limit-options">
            {credits && (
              <section className="p-limit-option" data-recommended="true" aria-labelledby="limit-credits">
                <h3 id="limit-credits">{t("limitWithCredits")}</h3>
                <p className="p-limit-gain">{creditsLine(plan, kind)}</p>
                <p>{t("limitCreditsPricing")}</p>
                {!addCredits && <p className="p-limit-note">{plan.role === "owner" ? t("limitTopUpsClosed") : t("limitAskOwner")}</p>}
              </section>
            )}
            <section className="p-limit-option" aria-labelledby="limit-managed">
              <h3 id="limit-managed">{t("limitManaged")}</h3>
              <p>{t("limitManagedBody")}</p>
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}
