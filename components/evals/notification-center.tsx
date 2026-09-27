"use client";

/**
 * Notification centre: a bell with the unread count, a panel with
 * notifications (what finished, failed or needs you) and activity (what is
 * queued or running now), a toast when something new arrives, and optional
 * desktop alerts while the tab is in the background.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, BellRing, CheckCircle2, CircleDot, Loader2, MessageCircleQuestion } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, EmptyState, StatusBadge, Tabs, relativeTime } from "./primitives";
import { SidePanel, notify } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { t, type MessageKey } from "@/lib/evals/messages/en";

type Notice = {
  id: string;
  kind: string;
  category: "completion" | "required_input" | "failure" | "progress";
  created_at: string;
  read: boolean;
  payload: { evaluationId?: string; evaluationTitle?: string; subjectTitle?: string; reportId?: string; reasonCode?: string; exportKind?: string; runId?: string };
};
type Job = { type: "website" | "document" | "generation" | "run" | "export"; id: string; status: string; reason_code: string | null; created_at: string; updated_at: string; evaluation_id: string | null; evaluation_title: string | null; subject: string | null; done: number | null; total: number | null };

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
const ACTIVE = new Set(["queued", "running", "profiling", "profile_ready", "drafting", "draft_ready", "captured", "persisting", "extracting", "pause_requested", "cancel_requested"]);

export function noticeTitle(notice: Pick<Notice, "kind">) {
  const key = KIND_LABEL[notice.kind];
  return key ? t(key) : notice.kind.replaceAll("_", " ");
}
function noticeDetail(notice: Notice) {
  return [notice.payload.subjectTitle, notice.payload.evaluationTitle].filter(Boolean).join(" · ");
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

  // Notices every 15 s; activity every 5 s while the panel shows it.
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
  useEffect(() => {
    if (!open || tab !== "activity") return;
    let timer = window.setTimeout(function tick() {
      void loadJobs().finally(() => {
        timer = window.setTimeout(tick, 5_000);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, tab, loadJobs]);

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

  const running = jobs?.filter((job) => ACTIVE.has(job.status)).length ?? 0;
  const listed = (notices ?? []).filter((item) => item.category !== "progress");

  return (
    <>
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
          <ul className="p-stack" style={{ listStyle: "none", margin: "12px 0 0", padding: 0, gap: 4 }}>
            {jobs.map((job) => {
              const active = ACTIVE.has(job.status);
              const content = (
                <span className="p-row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}>
                  {active ? <Loader2 aria-hidden="true" width={16} style={{ animation: "p-spin 900ms linear infinite" }} /> : <CircleDot aria-hidden="true" width={16} />}
                  <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <span>
                      <strong>{t(JOB_LABEL[job.type])}</strong>
                      {job.subject && job.type !== "export" ? ` · ${job.subject}` : job.type === "export" && job.subject ? ` · ${job.subject.toUpperCase()}` : ""}
                    </span>
                    {job.evaluation_title && <span className="p-cell-meta">{job.evaluation_title}</span>}
                    <span className="p-cell-meta">
                      {job.total ? `${job.done ?? 0}/${job.total} ${t("tests").toLowerCase()} · ` : ""}
                      {active ? `${t("startedAgo")} ${relativeTime(job.created_at)}` : relativeTime(job.updated_at)}
                    </span>
                  </span>
                  <span style={{ marginLeft: "auto", flex: "none" }}>
                    <StatusBadge value={job.status} />
                  </span>
                </span>
              );
              return (
                <li key={`${job.type}-${job.id}`} style={{ padding: "10px 8px", borderRadius: 8 }}>
                  {job.evaluation_id ? (
                    <Link href={withOrg(`/workspace/evaluations/${job.evaluation_id}`)} onClick={() => setOpen(false)} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
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
        {tab === "activity" && running > 0 && <Badge tone="info" dot live>{running} {t("jobsRunning")}</Badge>}
      </SidePanel>
    </>
  );
}
