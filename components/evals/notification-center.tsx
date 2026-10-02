"use client";

/**
 * Notification centre: a bell with the unread count, a live pill showing
 * work in progress with its percentage, a panel with notifications (what
 * finished, failed or needs you) and activity (every job with a progress
 * bar), a toast when something new arrives, and optional desktop alerts
 * while the tab is in the background. Opening an evaluation or report marks
 * its notices read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, BellRing, CheckCircle2, CircleDot, Loader2, MessageCircleQuestion } from "lucide-react";
import { evalRequest } from "./api";
import { Action, EmptyState, Progress, Tabs, relativeTime } from "./primitives";
import { SidePanel, notify } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { t, tv, type MessageKey } from "@/lib/evals/messages/en";

type Notice = {
  id: string;
  kind: string;
  category: "completion" | "required_input" | "failure" | "progress";
  created_at: string;
  read: boolean;
  payload: { evaluationId?: string; evaluationTitle?: string; subjectTitle?: string; reportId?: string; reasonCode?: string; exportKind?: string; runId?: string; supersedes?: string | null; pass?: number | null; scored?: number | null };
};
type Stage = "queued" | "reading" | "analysing" | "drafting" | "needs_input" | "asking" | "grading" | "reporting" | "exporting" | "paused" | "done" | "failed";
type Job = {
  type: "website" | "document" | "generation" | "run" | "export"; id: string; status: string; reason_code: string | null; created_at: string; updated_at: string;
  evaluation_id: string | null; evaluation_title: string | null; subject: string | null; done: number | null; total: number | null;
  grading_done: number | null; grading_total: number | null; percent: number | null; stage: Stage; active: boolean;
};
const STAGE_LABEL: Record<Stage, MessageKey> = {
  queued: "stageQueued", reading: "stageReading", analysing: "stageAnalysing", drafting: "stageDrafting", needs_input: "stageNeedsInput",
  asking: "stageAsking", grading: "stageGrading", reporting: "stageReporting", exporting: "stageExporting", paused: "stagePaused", done: "stageDone", failed: "stageFailed",
};
/** "7/10 tests" style counter for the stage a job is in, when it has one. */
function stageCount(job: Job) {
  if (job.stage === "asking" || (job.type === "run" && job.stage === "paused")) return job.total ? `${job.done ?? 0}/${job.total}` : null;
  if (job.stage === "grading") return job.grading_total ? `${job.grading_done ?? 0}/${job.grading_total}` : null;
  if (job.stage === "drafting" && job.total) return `${Math.min(job.done ?? 0, job.total)}/${job.total}`;
  return null;
}

const KIND_LABEL: Record<string, MessageKey> = {
  report_published: "noticeReportPublished",
  test_set_ready: "noticeTestSetReady",
  website_ready: "noticeWebsiteReady",
  document_ready: "noticeDocumentReady",
  export_completed: "noticeExportCompleted",
  monitor_pass: "noticeMonitorPass",
  input_required: "noticeInputRequired",
  generation_paused: "noticeGenerationPaused",
  run_paused: "noticeRunPaused",
  run_failed: "noticeRunFailed",
  generation_failed: "noticeGenerationFailed",
  website_failed: "noticeWebsiteFailed",
  document_failed: "noticeDocumentFailed",
  export_failed: "noticeExportFailed",
  monitor_regression: "noticeMonitorRegression",
  monitor_inconclusive: "noticeMonitorInconclusive",
  run_canceled: "noticeRunCanceled",
  website_started: "noticeWebsiteStarted",
  generation_started: "noticeGenerationStarted",
  run_started: "noticeRunStarted",
};
const JOB_LABEL: Record<Job["type"], MessageKey> = {
  website: "jobWebsite",
  document: "jobDocument",
  generation: "jobGeneration",
  run: "jobRun",
  export: "jobExport",
};

const NOTICE_COUNTED = (notices: Notice[], id: string) => notices.some((item) => item.id === id && item.category !== "progress");

export function noticeTitle(notice: Pick<Notice, "kind"> & { payload?: Notice["payload"] }) {
  if (notice.kind === "report_published" && notice.payload?.supersedes) return t("noticeResultsUpdated");
  const key = KIND_LABEL[notice.kind];
  return key ? t(key) : notice.kind.replaceAll("_", " ");
}
function noticeDetail(notice: Notice) {
  const score = notice.kind === "report_published" && typeof notice.payload.scored === "number" && notice.payload.scored > 0
    ? tv("answersCorrectOf", { pass: notice.payload.pass ?? 0, scored: notice.payload.scored }) : null;
  return [notice.payload.subjectTitle, notice.payload.evaluationTitle, score].filter(Boolean).join(" · ");
}
function noticeHref(notice: Notice, withOrg: (href: string) => string) {
  if (notice.payload.reportId) return withOrg(`/workspace/reports/${notice.payload.reportId}`);
  if (notice.payload.evaluationId) return withOrg(`/workspace/evaluations/${notice.payload.evaluationId}`);
  return null;
}
function NoticeIcon({ category }: { category: Notice["category"] }) {
  if (category === "failure") return <AlertTriangle aria-hidden="true" width={16} style={{ color: "var(--p-fail, #b42318)" }} />;
  if (category === "required_input") return <MessageCircleQuestion aria-hidden="true" width={16} style={{ color: "var(--p-warn, #b54708)" }} />;
  if (category === "progress") return <CircleDot aria-hidden="true" width={16} />;
  return <CheckCircle2 aria-hidden="true" width={16} style={{ color: "var(--p-pass, #067647)" }} />;
}

export function NotificationCenter() {
  const { orgId, withOrg } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notifications" | "activity">("notifications");
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">("default");
  const pathname = usePathname();

  useEffect(() => {
    setDesktop(typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission);
  }, []);

  const loadNotices = useCallback(async () => {
    if (!orgId) return;
    try {
      const value = await evalRequest<{ notifications: Notice[]; unread: number }>(`/notifications?orgId=${encodeURIComponent(orgId)}`);
      // Announce what arrived since the last poll (not the backlog on first load).
      if (seen.current) {
        const fresh = value.notifications.filter((item) => !seen.current!.has(item.id) && !item.read && item.category !== "progress");
        for (const item of fresh.slice(0, 3)) {
          notify(`${noticeTitle(item)}${noticeDetail(item) ? ` — ${noticeDetail(item)}` : ""}`);
          if (typeof document !== "undefined" && document.hidden && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(noticeTitle(item), { body: noticeDetail(item), tag: item.id });
            } catch {
              /* some browsers only allow notifications from a service worker */
            }
          }
        }
      }
      seen.current = new Set(value.notifications.map((item) => item.id));
      setNotices(value.notifications);
      setUnread(value.unread);
    } catch {
      /* the next poll retries */
    }
  }, [orgId]);
  const loadJobs = useCallback(async () => {
    if (!orgId) return;
    try {
      setJobs(await evalRequest<Job[]>(`/activity?orgId=${encodeURIComponent(orgId)}`));
    } catch {
      /* the next poll retries */
    }
  }, [orgId]);

  // Notices every 15 s. Activity drives the live pill: every 5 s while
  // something runs (or the panel shows it), every 30 s otherwise.
  useEffect(() => {
    seen.current = null;
    setNotices(null);
    let timer = window.setTimeout(function tick() {
      void loadNotices().finally(() => {
        timer = window.setTimeout(tick, document.hidden ? 60_000 : 15_000);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotices]);
  const busy = jobs?.some((job) => job.active) ?? false;
  const watching = open && tab === "activity";
  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      void loadJobs().finally(() => {
        timer = window.setTimeout(tick, document.hidden ? 60_000 : busy || watching ? 5_000 : 30_000);
      });
    }, busy || watching ? 0 : 1_000);
    return () => window.clearTimeout(timer);
  }, [loadJobs, busy, watching]);

  // Looking at an evaluation or its report reads its notices.
  useEffect(() => {
    if (!notices?.length || !pathname) return;
    const match = /\/workspace\/(evaluations|reports)\/([0-9a-f-]{36})/.exec(pathname);
    if (!match) return;
    const ids = notices.filter((item) => !item.read && (match[1] === "evaluations" ? item.payload.evaluationId === match[2] : item.payload.reportId === match[2])).map((item) => item.id);
    if (!ids.length) return;
    setNotices((current) => current?.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)) ?? current);
    setUnread((value) => Math.max(0, value - ids.filter((id) => NOTICE_COUNTED(notices, id)).length));
    void evalRequest("/notifications/read", "POST", { orgId, ids }).catch(() => undefined);
  }, [pathname, notices, orgId]);

  async function markAll() {
    await evalRequest("/notifications/read", "POST", { orgId, all: true }).catch(() => undefined);
    setNotices((current) => current?.map((item) => ({ ...item, read: true })) ?? current);
    setUnread(0);
  }
  async function markOne(id: string) {
    setNotices((current) => current?.map((item) => (item.id === id ? { ...item, read: true } : item)) ?? current);
    setUnread((value) => Math.max(0, value - 1));
    await evalRequest("/notifications/read", "POST", { orgId, ids: [id] }).catch(() => undefined);
  }
  async function enableDesktop() {
    if (!("Notification" in window)) return;
    setDesktop(await Notification.requestPermission());
  }

  const activeJobs = jobs?.filter((job) => job.active) ?? [];
  const running = activeJobs.length;
  const listed = (notices ?? []).filter((item) => item.category !== "progress");
  const known = activeJobs.filter((job) => job.percent !== null);
  const overall = known.length ? Math.round(known.reduce((sum, job) => sum + (job.percent ?? 0), 0) / known.length) : null;
  const lead = activeJobs[0];

  return (
    <>
      {running > 0 && (
        <button
          type="button"
          className="p-jobs-pill"
          onClick={() => { setTab("activity"); setOpen(true); }}
          aria-label={`${t("backgroundWork")}: ${tv("jobsInProgress", { count: running })}${overall !== null ? `, ${overall}%` : ""}`}
          title={t("backgroundWork")}
        >
          <Loader2 aria-hidden="true" />
          <span>
            {running === 1 && lead
              ? tv("jobInProgress", { label: t(STAGE_LABEL[lead.stage]), percent: lead.percent ?? 0 })
              : `${tv("jobsInProgress", { count: running })}${overall !== null ? ` · ${overall}%` : ""}`}
          </span>
          {overall !== null && <Progress value={overall} max={100} label={t("backgroundWork")} />}
        </button>
      )}
      <button
        type="button"
        className="p-btn"
        data-variant="ghost"
        data-shape="icon"
        aria-label={unread ? `${t("notifications")}: ${unread} ${t("unread")}` : t("notifications")}
        title={t("notifications")}
        onClick={() => setOpen(true)}
        style={{ position: "relative" }}
      >
        {unread ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "var(--p-accent, #111)", color: "var(--p-accent-contrast, #fff)", fontSize: 10, lineHeight: "16px", fontWeight: 600 }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <SidePanel
        open={open}
        onOpenChange={setOpen}
        title={t("notifications")}
        description={t("notificationsHelp")}
        footer={
          desktop === "default" ? (
            <Action variant="ghost" size="sm" onClick={() => void enableDesktop()}>
              {t("enableDesktopAlerts")}
            </Action>
          ) : desktop === "granted" ? (
            <span className="p-cell-meta">{t("desktopAlertsOn")}</span>
          ) : undefined
        }
      >
        <div className="p-row" style={{ justifyContent: "space-between" }}>
          <Tabs
            variant="pill"
            value={tab}
            onChange={setTab}
            label={t("notifications")}
            options={[
              { value: "notifications", label: t("notifications"), count: unread || undefined },
              { value: "activity", label: t("activity"), count: running || undefined },
            ]}
          />
          {tab === "notifications" && unread > 0 && (
            <Action variant="ghost" size="sm" onClick={() => void markAll()}>
              {t("markAllRead")}
            </Action>
          )}
        </div>
        {tab === "notifications" ? (
          notices === null ? (
            <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("loading")}</p>
          ) : listed.length ? (
            <ul className="p-stack" style={{ listStyle: "none", margin: "12px 0 0", padding: 0, gap: 4 }}>
              {listed.map((item) => {
                const href = noticeHref(item, withOrg);
                const body = (
                  <span className="p-row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}>
                    <NoticeIcon category={item.category} />
                    <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: item.read ? 400 : 600 }}>{noticeTitle(item)}</span>
                      {noticeDetail(item) && <span className="p-cell-meta">{noticeDetail(item)}</span>}
                      <span className="p-cell-meta">{relativeTime(item.created_at)}</span>
                    </span>
                    {!item.read && <span aria-label={t("unread")} style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: 4, background: "var(--p-accent, #111)", flex: "none", marginTop: 6 }} />}
                  </span>
                );
                return (
                  <li key={item.id} style={{ padding: "10px 8px", borderRadius: 8, background: item.read ? undefined : "var(--p-surface-2)" }}>
                    {href ? (
                      <Link href={href} onClick={() => { void markOne(item.id); setOpen(false); }} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                        {body}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => void markOne(item.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t("noNotifications")} icon={<Bell />}>
              <p>{t("noNotificationsHelp")}</p>
            </EmptyState>
          )
        ) : jobs === null ? (
          <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("loading")}</p>
        ) : jobs.length ? (
          <ul className="p-job-list">
            {jobs.map((job) => {
              const counter = stageCount(job);
              const content = (
                <>
                  <span className="p-job-head">
                    {job.active ? <Loader2 aria-hidden="true" data-spin="true" /> : job.stage === "failed" ? <AlertTriangle aria-hidden="true" /> : job.stage === "done" ? <CheckCircle2 aria-hidden="true" /> : <CircleDot aria-hidden="true" />}
                    <span className="p-job-body">
                      <span>
                        <strong>{t(JOB_LABEL[job.type])}</strong>
                        {job.subject && job.type !== "export" ? ` · ${job.subject}` : job.type === "export" && job.subject ? ` · ${job.subject.toUpperCase()}` : ""}
                      </span>
                      {job.evaluation_title && <span className="p-cell-meta">{job.evaluation_title}</span>}
                      <span className="p-cell-meta">
                        {t(STAGE_LABEL[job.stage])}
                        {counter ? ` · ${counter}` : ""}
                        {" · "}
                        {job.active ? `${t("startedAgo")} ${relativeTime(job.created_at)}` : relativeTime(job.updated_at)}
                      </span>
                    </span>
                    {job.percent !== null && (job.active || job.stage === "paused") && <span className="p-job-end"><span className="p-job-percent">{job.percent}%</span></span>}
                  </span>
                  {job.percent !== null && (job.active || job.stage === "paused") && <Progress value={job.percent} max={100} label={t(JOB_LABEL[job.type])} />}
                </>
              );
              return (
                <li key={`${job.type}-${job.id}`} className="p-job" data-active={job.active ? "true" : undefined}>
                  {job.evaluation_id ? (
                    <Link className="p-job-link" href={withOrg(`/workspace/evaluations/${job.evaluation_id}`)} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={t("noActivity")} icon={<CircleDot />}>
            <p>{t("noActivityHelp")}</p>
          </EmptyState>
        )}
      </SidePanel>
    </>
  );
}
