"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, BellRing, Check, CheckCircle2, CircleDot, CreditCard, Loader2, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Chip, EmptyState, Progress, Status, Tabs, formatDate, relativeTime } from "./primitives";
import { SidePanel, notify } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/en";

type Notice = {
  id: string; kind: string; category: "completion" | "required_input" | "failure" | "progress" | "billing"; created_at: string; read: boolean;
  payload: { evaluationId?: string; evaluationTitle?: string; subjectTitle?: string; reportId?: string; reasonCode?: string; exportKind?: string; runId?: string; supersedes?: string | null; pass?: number | null; scored?: number | null;
    // An expert-reviewed revision (launch L-26): the number of experts on its label.
    expertReviewers?: string;
    // Billing notices (launch L-15): whole credits.
    balance?: number; threshold?: number; cap?: number | null; percent?: number; scope?: "monthly" | "run" | "schedule"; credits?: number; expiresAt?: string; amountCents?: number; average?: number;
    // Scheduled runs (launch L-18): a skipped slot, and the summary after each run.
    reason?: string; needed?: number; available?: number; comparable?: boolean; previousPass?: number | null; previousScored?: number | null;
    brokenTotal?: number; broken?: Array<{ title: string; assessmentId: string | null }> };
};
type Cursor = { createdAt: string; id: string };
type NoticePage = { notifications: Notice[]; unread: number; nextCursor: Cursor | null };
type Stage = "queued" | "reading" | "analysing" | "drafting" | "needs_input" | "asking" | "grading" | "reporting" | "exporting" | "paused" | "pausing" | "canceling" | "canceled" | "done" | "failed";
type Job = {
  type: "website" | "document" | "generation" | "run" | "export"; id: string; status: string; reason_code: string | null; created_at: string; updated_at: string;
  evaluation_id: string | null; evaluation_title: string | null; subject: string | null; done: number | null; total: number | null;
  grading_done: number | null; grading_total: number | null; percent: number | null; stage: Stage; active: boolean;
};
const STAGE_LABEL: Record<Stage, MessageKey> = {
  queued: "stageQueued", reading: "stageReading", analysing: "stageAnalysing", drafting: "stageDrafting", needs_input: "stageNeedsInput",
  asking: "stageAsking", grading: "stageGrading", reporting: "stageReporting", exporting: "stageExporting", paused: "stagePaused", pausing: "stagePausing",
  canceling: "stageCanceling", canceled: "stageCanceled", done: "stageDone", failed: "stageFailed",
};
function stageCount(job: Job) {
  if (job.stage === "asking" || (job.type === "run" && job.stage === "paused")) return job.total ? `${job.done ?? 0}/${job.total}` : null;
  if (job.stage === "grading") return job.grading_total ? `${job.grading_done ?? 0}/${job.grading_total}` : null;
  if (job.stage === "drafting" && job.total) return `${Math.min(job.done ?? 0, job.total)}/${job.total}`;
  return null;
}
const KIND_LABEL: Record<string, MessageKey> = {
  report_published: "noticeReportPublished", test_set_ready: "noticeTestSetReady", website_ready: "noticeWebsiteReady", document_ready: "noticeDocumentReady",
  export_completed: "noticeExportCompleted", monitor_pass: "noticeMonitorPass", input_required: "noticeInputRequired", generation_paused: "noticeGenerationPaused",
  run_paused: "noticeRunPaused", run_failed: "noticeRunFailed", generation_failed: "noticeGenerationFailed", website_failed: "noticeWebsiteFailed",
  document_failed: "noticeDocumentFailed", export_failed: "noticeExportFailed", monitor_regression: "noticeMonitorRegression", monitor_inconclusive: "noticeMonitorInconclusive",
  run_canceled: "noticeRunCanceled", website_started: "noticeWebsiteStarted", generation_started: "noticeGenerationStarted", run_started: "noticeRunStarted",
  auto_recharge_failed: "noticeAutoRechargeFailed",
  // Billing notices (launch L-15).
  auto_recharge_succeeded: "noticeAutoRechargeSucceeded", low_balance: "noticeLowBalance", cap_reached: "noticeCapReached",
  credits_expiring: "noticeCreditsExpiring", unusual_spend: "noticeUnusualSpend",
  // Scheduled runs (launch L-18).
  schedule_skipped: "noticeScheduleSkipped", monitor_unknown: "noticeMonitorUnknown",
  price_increase: "noticePriceIncrease",
};
const JOB_LABEL: Record<Job["type"], MessageKey> = { website: "jobWebsite", document: "jobDocument", generation: "jobGeneration", run: "jobRun", export: "jobExport" };
export function noticeTitle(notice: Pick<Notice, "kind"> & { payload?: Notice["payload"] }) {
  if (notice.kind === "report_published" && Number(notice.payload?.expertReviewers) > 0) return t("noticeReportReviewed");
  if (notice.kind === "report_published" && notice.payload?.supersedes) return t("noticeResultsUpdated");
  const key = KIND_LABEL[notice.kind];
  return key ? t(key) : notice.kind.replaceAll("_", " ");
}
const count = (value: number | undefined) => new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB").format(Number(value ?? 0));
function billingDetail(notice: Notice): string | null {
  const p = notice.payload;
  switch (notice.kind) {
    case "low_balance": return tv("noticeLowBalanceDetail", { balance: count(p.balance), threshold: count(p.threshold) });
    case "cap_reached": return p.scope === "run" ? tv("noticeCapRunDetail", { cap: count(p.cap ?? 0) })
      : p.scope === "schedule" ? tv("noticeCapScheduleDetail", { cap: count(p.cap ?? 0) })
      : tv("noticeCapMonthDetail", { percent: p.percent ?? 100, cap: count(p.cap ?? 0) });
    case "schedule_skipped": {
      const why = p.reason === "credits_exhausted" ? tv("noticeScheduleSkippedCredits", { needed: count(p.needed), available: count(p.available) })
        : typeof p.cap === "number" ? tv("noticeScheduleSkippedCap", { cap: count(p.cap) }) : t("noticeScheduleSkippedCapAny");
      return [why, p.evaluationTitle].filter(Boolean).join(" · ");
    }
    case "credits_expiring": return tv("noticeCreditsExpiringDetail", { credits: count(p.credits), date: formatDate(p.expiresAt ?? null) });
    case "auto_recharge_succeeded": return tv("noticeAutoRechargeSucceededDetail", { credits: count(p.credits) });
    case "unusual_spend": return tv("noticeUnusualSpendDetail", { credits: count(p.credits), average: count(p.average) });
    default: return null;
  }
}
const percentOf = (pass: number | null | undefined, scored: number | null | undefined) =>
  scored ? new Intl.NumberFormat(getLocale() === "es" ? "es-ES" : "en-GB", { style: "percent", maximumFractionDigits: 0 }).format(Number(pass ?? 0) / scored) : null;
/** The summary after a scheduled run (launch L-18, P-25): score against last time and newly broken questions. */
function monitorDetail(notice: Notice): string | null {
  const p = notice.payload;
  if (!notice.kind.startsWith("monitor_") || typeof p.scored !== "number") return null;
  const now = percentOf(p.pass, p.scored), before = percentOf(p.previousPass, p.previousScored);
  const parts = [
    now ? (before && p.comparable ? tv("noticeMonitorScore", { now, before }) : tv("noticeMonitorScoreFirst", { now })) : null,
    p.comparable === false && p.previousScored != null ? t("noticeMonitorNotComparable") : null,
    p.brokenTotal ? (p.brokenTotal === 1 ? t("monitorNewlyBrokenOne") : tv("monitorNewlyBroken", { n: p.brokenTotal })) : null,
    p.evaluationTitle,
  ];
  return parts.filter(Boolean).join(" · ");
}
function noticeDetail(notice: Notice) {
  if (notice.category === "billing") return billingDetail(notice) ?? "";
  const monitor = monitorDetail(notice);
  if (monitor !== null) return monitor;
  const score = notice.kind === "report_published" && typeof notice.payload.scored === "number" && notice.payload.scored > 0
    ? tv("answersCorrectOf", { pass: notice.payload.pass ?? 0, scored: notice.payload.scored }) : null;
  return [notice.payload.subjectTitle, notice.payload.evaluationTitle, score].filter(Boolean).join(" · ");
}
function noticeHref(notice: Notice, withOrg: (href: string) => string) {
  if (notice.kind === "schedule_skipped") {
    return withOrg(notice.payload.reason === "credits_exhausted" ? "/workspace/settings?tab=billing&view=top-up" : "/workspace/settings?tab=monitoring");
  }
  if (notice.category === "billing") {
    const view = notice.kind === "cap_reached" ? (notice.payload.scope === "schedule" ? "" : "&view=limits") : notice.kind === "low_balance" || notice.kind === "auto_recharge_failed" ? "&view=top-up" : notice.kind === "unusual_spend" ? "&view=usage" : "";
    if (notice.kind === "cap_reached" && notice.payload.scope === "schedule") return withOrg("/workspace/settings?tab=monitoring");
    return withOrg(`/workspace/settings?tab=billing${view}`);
  }
  if (notice.payload.reportId) return withOrg(`/workspace/reports/${notice.payload.reportId}`);
  if (notice.payload.evaluationId) return withOrg(`/workspace/evaluations/${notice.payload.evaluationId}`);
  return null;
}
function NoticeIcon({ category }: { category: Notice["category"] }) {
  if (category === "billing") return <CreditCard aria-hidden="true" />;
  if (category === "failure") return <AlertTriangle aria-hidden="true" />;
  if (category === "required_input") return <MessageCircleQuestion aria-hidden="true" />;
  if (category === "progress") return <CircleDot aria-hidden="true" />;
  return <CheckCircle2 aria-hidden="true" />;
}
function mergeNotices(current: Notice[], incoming: Notice[]) {
  const items = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => items.set(item.id, item));
  return [...items.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}
/** Polling stops on unmount, including when an in-flight request finishes after cleanup. */
function usePolling(task: () => Promise<void>, interval: number) {
  useEffect(() => {
    let stopped = false;
    let timer: number;
    async function tick() {
      await task();
      if (!stopped) timer = window.setTimeout(() => void tick(), document.hidden ? 60_000 : interval);
    }
    timer = window.setTimeout(() => void tick(), 0);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [task, interval]);
}

export function NotificationCenter() {
  const { orgId } = useWorkspace();
  // A new workspace gets fresh state. Old requests and timers cannot update or announce its data.
  return <WorkspaceNotifications key={orgId} />;
}
function WorkspaceNotifications() {
  const { orgId, withOrg } = useWorkspace();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notifications" | "activity">("notifications");
  const [noticeFilter, setNoticeFilter] = useState<"all" | "unread">("all");
  const [activityFilter, setActivityFilter] = useState<"all" | "running" | "attention" | "finished">("all");
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [unread, setUnread] = useState(0);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [jobError, setJobError] = useState(false);
  const [readError, setReadError] = useState<{ ids: string[]; all: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">("default");
  const alive = useRef(false);
  const sequence = useRef(0);
  const jobSequence = useRef(0);
  const seen = useRef<Set<string> | null>(null);
  const olderLoaded = useRef(false);
  const loadedNotices = useRef<Notice[] | null>(null);
  const filterVersion = useRef(0);
  const pendingReads = useRef(new Set<string>());
  const attemptedReads = useRef(new Set<string>());
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    alive.current = true;
    setDesktop("Notification" in window ? Notification.permission : "unsupported");
    return () => { alive.current = false; };
  }, []);

  const loadNotices = useCallback(async () => {
    if (!orgId) return;
    const request = ++sequence.current;
    try {
      const value = await evalRequest<NoticePage>(`/notifications?orgId=${encodeURIComponent(orgId)}&unreadOnly=${noticeFilter === "unread"}`);
      if (!alive.current || request !== sequence.current) return;
      if (seen.current) {
        const fresh = value.notifications.filter(item => !seen.current!.has(item.id) && !item.read && item.category !== "progress");
        for (const item of fresh.slice(0, 3)) {
          notify(`${noticeTitle(item)}${noticeDetail(item) ? ` — ${noticeDetail(item)}` : ""}`);
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            try { new Notification(noticeTitle(item), { body: noticeDetail(item), tag: `${orgId}:${item.id}` }); } catch { /* browsers may require a service worker */ }
          }
        }
      }
      // Retain announced IDs so scrolling or changing read state never announces old notices again.
      seen.current ??= new Set();
      value.notifications.forEach(item => seen.current!.add(item.id));
      if (seen.current.size > 1000) seen.current = new Set([...seen.current].slice(-500));
      const current = loadedNotices.current;
      const overlaps = value.notifications.some(item => current?.some(existing => existing.id === item.id));
      if (olderLoaded.current && !overlaps) olderLoaded.current = false;
      const next = olderLoaded.current ? mergeNotices(current ?? [], value.notifications).filter(item => noticeFilter !== "unread" || !item.read) : value.notifications;
      loadedNotices.current = next;
      setNotices(next);
      if (!olderLoaded.current) setCursor(value.nextCursor ?? null);
      setUnread(value.unread);
      setNoticeError(false);
    } catch {
      if (alive.current && request === sequence.current) setNoticeError(true);
    }
  }, [orgId, noticeFilter]);
  const latestLoadNotices = useRef(loadNotices);
  useEffect(() => { latestLoadNotices.current = loadNotices; }, [loadNotices]);
  const loadJobs = useCallback(async () => {
    if (!orgId) return;
    const request = ++jobSequence.current;
    try {
      const value = await evalRequest<Job[]>(`/activity?orgId=${encodeURIComponent(orgId)}`);
      if (alive.current && request === jobSequence.current) { setJobs(value); setJobError(false); }
    } catch { if (alive.current && request === jobSequence.current) setJobError(true); }
  }, [orgId]);
  useEffect(() => {
    sequence.current++;
    loadedNotices.current = null;
    setNotices(null);
    setCursor(null);
    setNoticeError(false);
    seen.current = null;
    olderLoaded.current = false;
  }, [noticeFilter]);
  usePolling(loadNotices, 15_000);
  const busy = jobs?.some(job => job.active) ?? false;
  usePolling(loadJobs, busy || open ? 5_000 : 30_000);
  useEffect(() => {
    function resume() {
      if (!document.hidden) { void loadNotices(); void loadJobs(); }
    }
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => { window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [loadNotices, loadJobs]);

  async function loadOlder() {
    if (!cursor || loadingMore) return;
    const version = filterVersion.current;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({ orgId, unreadOnly: String(noticeFilter === "unread"), beforeAt: cursor.createdAt, beforeId: cursor.id });
      const value = await evalRequest<NoticePage>(`/notifications?${query}`);
      if (!alive.current || version !== filterVersion.current) return;
      sequence.current++; // This page includes a newer read snapshot than a pending poll.
      olderLoaded.current = true;
      value.notifications.forEach(item => seen.current?.add(item.id));
      const next = mergeNotices(loadedNotices.current ?? [], value.notifications);
      loadedNotices.current = next;
      setNotices(next);
      setUnread(value.unread);
      setCursor(value.nextCursor ?? null);
      setNoticeError(false);
    } catch { if (alive.current && version === filterVersion.current) setNoticeError(true); }
    finally { if (alive.current) setLoadingMore(false); }
  }
  const markRead = useCallback(async (ids: string[], all = false) => {
    const fresh = ids.filter(id => !pendingReads.current.has(id));
    if (!all && !fresh.length) return;
    fresh.forEach(id => pendingReads.current.add(id));
    sequence.current++; // Ignore a poll begun before this write.
    filterVersion.current++; // An older-page snapshot cannot undo a confirmed read.
    try {
      await evalRequest("/notifications/read", "POST", { orgId, ...(all ? { all: true } : { ids: fresh }) });
      if (!alive.current) return;
      const current = loadedNotices.current;
      const count = (current ?? []).filter(item => !item.read && (all || fresh.includes(item.id))).length;
      const next = current?.map(item => all || fresh.includes(item.id) ? { ...item, read: true } : item) ?? null;
      loadedNotices.current = next;
      setNotices(next);
      setUnread(value => all ? 0 : Math.max(0, value - count));
      setReadError(null);
      await latestLoadNotices.current(); // Reload the current filter, even if it changed during the write.
    } catch { if (alive.current) setReadError({ ids: fresh, all }); }
    finally { fresh.forEach(id => pendingReads.current.delete(id)); }
  }, [orgId]);
  useEffect(() => { attemptedReads.current.clear(); }, [pathname]);
  useEffect(() => {
    const match = /\/workspace\/(evaluations|reports)\/([0-9a-f-]{36})/.exec(pathname ?? "");
    if (!match) return;
    const ids = (notices ?? []).filter(item => !item.read && !attemptedReads.current.has(item.id) &&
      (match[1] === "evaluations" ? item.payload.evaluationId === match[2] : item.payload.reportId === match[2])).map(item => item.id);
    if (!ids.length) return;
    ids.forEach(id => attemptedReads.current.add(id));
    void markRead(ids);
  }, [pathname, notices, markRead]);
  async function markAll() {
    if (marking) return;
    setMarking(true);
    await markRead((notices ?? []).filter(item => !item.read).map(item => item.id), true);
    if (alive.current) setMarking(false);
  }
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    filterVersion.current++;
    olderLoaded.current = false;
    await Promise.allSettled([loadNotices(), loadJobs()]);
    if (alive.current) setRefreshing(false);
  }
  async function enableDesktop() {
    try {
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        if (alive.current) setDesktop(permission);
      }
    } catch { /* Permission prompts can be unavailable; in-app notices remain usable. */ }
  }
  function showPanel(element: HTMLElement, nextTab: typeof tab = "notifications") {
    trigger.current = element;
    setTab(nextTab);
    filterVersion.current++;
    olderLoaded.current = false;
    setOpen(true);
    void loadNotices(); void loadJobs();
  }
  const activeJobs = jobs?.filter(job => job.active) ?? [];
  const running = activeJobs.length;
  const known = activeJobs.filter(job => job.percent !== null);
  const overall = known.length ? Math.round(known.reduce((sum, job) => sum + (job.percent ?? 0), 0) / known.length) : null;
  const lead = activeJobs[0];
  const listed = (notices ?? []).filter(item => item.category !== "progress" && (noticeFilter !== "unread" || !item.read));
  const attention = (job: Job) => ["needs_input", "paused", "failed"].includes(job.stage);
  const filteredJobs = (jobs ?? []).filter(job => activityFilter === "all" || (activityFilter === "running" ? job.active : activityFilter === "attention" ? attention(job) : job.stage === "done" || job.stage === "canceled"));
  return <>
    {running > 0 && <Action variant="ghost" className="p-btn p-jobs-pill" onClick={event => showPanel(event.currentTarget, "activity")}
      aria-label={`${t("backgroundWork")}: ${tv("jobsInProgress", { count: running })}${overall !== null ? `, ${overall}%` : ""}`} title={t("backgroundWork")}>
      <Loader2 aria-hidden="true" />
      <span>{running === 1 && lead ? `${t(STAGE_LABEL[lead.stage])}${lead.percent !== null ? ` · ${lead.percent}%` : ""}` : `${tv("jobsInProgress", { count: running })}${overall !== null ? ` · ${overall}%` : ""}`}</span>
      {overall !== null && <Progress value={overall} max={100} label={t("backgroundWork")} />}
    </Action>}
    <Action variant="ghost" shape="icon" className="p-btn p-notice-bell" aria-label={unread ? `${t("notifications")}: ${unread} ${t("unread")}` : t("notifications")}
      title={t("notifications")} onClick={event => showPanel(event.currentTarget)}>
      {unread ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
      {unread > 0 && <span className="p-notice-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </Action>
    <SidePanel open={open} onOpenChange={setOpen} title={t("notifications")} description={t("notificationsHelp")} returnFocus={() => trigger.current}
      footer={desktop === "default" ? <Action variant="ghost" size="sm" onClick={() => void enableDesktop()}>{t("enableDesktopAlerts")}</Action>
        : desktop === "granted" ? <span className="p-cell-meta">{t("desktopAlertsOn")}</span> : undefined}>
      <div className="p-notice-center">
      <div className="p-notice-toolbar">
        <Tabs variant="pill" value={tab} onChange={setTab} label={t("notifications")} options={[
          { value: "notifications", label: t("notifications"), count: unread || undefined }, { value: "activity", label: t("activity"), count: running || undefined },
        ]} />
        <Action variant="ghost" size="sm" shape="icon" aria-label={t("refresh")} title={t("refresh")} disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? <Loader2 aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        </Action>
      </div>
      <div className="p-notice-filters" role="group" aria-label={t(tab === "notifications" ? "notificationFilters" : "activityFilters")}>
        {tab === "notifications" ? <>
          <Chip active={noticeFilter === "all"} aria-pressed={noticeFilter === "all"} onClick={() => { sequence.current++; filterVersion.current++; setNoticeFilter("all"); }}>{t("all")}</Chip>
          <Chip active={noticeFilter === "unread"} aria-pressed={noticeFilter === "unread"} onClick={() => { sequence.current++; filterVersion.current++; setNoticeFilter("unread"); }}>{t("unreadNotices")}</Chip>
          {unread > 0 && <Action variant="ghost" size="sm" disabled={marking} onClick={() => void markAll()}>{t("markAllRead")}</Action>}
        </> : ([ ["all", "all"], ["running", "inProgress"], ["attention", "activityAttention"], ["finished", "completed"] ] as const).map(([value, label]) =>
          <Chip key={value} active={activityFilter === value} aria-pressed={activityFilter === value} onClick={() => setActivityFilter(value)}>{t(label)}</Chip>)}
      </div>
      <p className="p-notice-order">{t("latestFirst")}</p>
      {(tab === "notifications" ? noticeError : jobError) && <Status tone="warn" action={<Action variant="ghost" size="sm" onClick={() => void refresh()}>{t("retry")}</Action>}>{t("notificationRefreshFailed")}</Status>}
      {readError && <Status tone="error" action={<Action variant="ghost" size="sm" onClick={() => void markRead(readError.ids, readError.all)}>{t("retry")}</Action>}>{t("notificationReadFailed")}</Status>}
      {tab === "notifications" ? notices === null && !noticeError ? <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("loading")}</p>
        : listed.length ? <ul className="p-notice-list">{listed.map(item => {
          const href = noticeHref(item, withOrg);
          const body = <><NoticeIcon category={item.category} /><span className="p-job-body">
            <span className="p-notice-title">{noticeTitle(item)}</span>
            {noticeDetail(item) && <span className="p-cell-meta">{noticeDetail(item)}</span>}
            <time className="p-cell-meta" dateTime={item.created_at} title={formatDate(item.created_at, true)}>{relativeTime(item.created_at)}</time>
          </span></>;
          const link = href ? <Link className="p-notice-link" href={href} onClick={() => { if (!item.read) void markRead([item.id]); setOpen(false); }}>{body}</Link>
            : <div className="p-notice-link">{body}</div>;
          // Launch L-18: a scheduled run's newly broken questions, each opening its answer in the report.
          const broken = item.kind.startsWith("monitor_") && item.payload.reportId && item.payload.broken?.length ? item.payload.broken.slice(0, 5) : [];
          return <li key={item.id} className="p-notice" data-read={item.read} data-category={item.category}>
            {broken.length ? <div className="p-notice-stack">{link}
              <ul className="p-notice-sublist" aria-label={t("noticeMonitorBrokenList")}>{broken.map((question, index) => <li key={`${question.assessmentId ?? index}`}>
                {question.assessmentId ? <Link href={withOrg(`/workspace/reports/${item.payload.reportId}?result=${encodeURIComponent(question.assessmentId)}`)}
                  onClick={() => { if (!item.read) void markRead([item.id]); setOpen(false); }}>{question.title}</Link> : question.title}
              </li>)}</ul>
            </div> : link}
            {!item.read && <Action variant="ghost" size="sm" shape="icon" aria-label={`${t("markRead")}: ${noticeTitle(item)}`} title={t("markRead")}
              onClick={() => void markRead([item.id])}><Check aria-hidden="true" /></Action>}
          </li>;
        })}</ul>
        : !noticeError && <EmptyState title={t(noticeFilter === "unread" ? "noUnreadNotifications" : "noNotifications")} icon={<Bell />}><p>{t("noNotificationsHelp")}</p></EmptyState>
        : jobs === null && !jobError ? <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("loading")}</p>
        : filteredJobs.length ? <ul className="p-job-list">{filteredJobs.map(job => {
          const counter = stageCount(job);
          const content = <><span className="p-job-head">
            {job.active ? <Loader2 aria-hidden="true" data-spin="true" /> : job.stage === "failed" ? <AlertTriangle aria-hidden="true" /> : job.stage === "done" ? <CheckCircle2 aria-hidden="true" /> : <CircleDot aria-hidden="true" />}
            <span className="p-job-body"><span><strong>{t(JOB_LABEL[job.type])}</strong>{job.subject ? ` · ${job.type === "export" ? job.subject.toUpperCase() : job.subject}` : ""}</span>
              {job.evaluation_title && <span className="p-cell-meta">{job.evaluation_title}</span>}
              <span className="p-cell-meta">{t(STAGE_LABEL[job.stage])}{counter ? ` · ${counter}` : ""}{" · "}
                <time dateTime={job.updated_at} title={`${formatDate(job.updated_at, true)} · ${t("startedAgo")} ${formatDate(job.created_at, true)}`}>{relativeTime(job.updated_at)}</time>
              </span>
            </span>
            {job.percent !== null && (job.active || job.stage === "paused") && <span className="p-job-end"><span className="p-job-percent">{job.percent}%</span></span>}
          </span>{job.percent !== null && (job.active || job.stage === "paused") && <Progress value={job.percent} max={100} label={t(JOB_LABEL[job.type])} />}</>;
          return <li key={`${job.type}-${job.id}`} className="p-job" data-stage={job.stage} data-active={job.active ? "true" : undefined}>
            {job.evaluation_id ? <Link className="p-job-link" href={withOrg(`/workspace/evaluations/${job.evaluation_id}`)} onClick={() => setOpen(false)}>{content}</Link> : content}
          </li>;
        })}</ul> : !jobError && <EmptyState title={t(activityFilter === "all" ? "noActivity" : "noMatchingActivity")} icon={<CircleDot />}><p>{t("noActivityHelp")}</p></EmptyState>}
      {tab === "notifications" && cursor && <Action variant="secondary" block disabled={loadingMore} onClick={() => void loadOlder()}>{t(loadingMore ? "loading" : "olderNotifications")}</Action>}
      </div>
    </SidePanel>
  </>;
}
