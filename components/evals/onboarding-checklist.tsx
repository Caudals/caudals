"use client";

/**
 * First-run onboarding (launch L-06, spec v2 P-01, P-02, P-04):
 *
 * - the activation checklist (connect, reference pages, run, results,
 *   invite), persisted per workspace and dismissable, computed from real
 *   state by the server (evals.workspace_onboarding_state);
 * - the optional two-question welcome after the first sign-in;
 * - the evaluation page's "first evaluation" checklist for an imported demo:
 *   connection check, reading the site, the automatic test set, run and
 *   results, with honest time ranges, a "what happens next" panel, the demo's
 *   recovery guidance and "Get help".
 *
 * Everything renders only when ONBOARDING_AUTOSTART is on; the shell reads
 * the flag on the server and provides it here.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check as CheckIcon, LifeBuoy, Plug, X } from "lucide-react";
import { evalRequest } from "./api";
import { Action, ActionLink, Card, Chip, Status } from "./primitives";
import { notify } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { ExampleEvaluationLink } from "./example-evaluation-links";
import { loadWorkspaceOnboarding, updateWorkspaceOnboarding, useOnboardingState, type OnboardingUpdate } from "./workspace-onboarding-store";
import type { WorkspaceEvaluation } from "./workspace-data";
import {
  CHECKLIST_STEPS, GOALS, SYSTEM_TYPES,
  type ChecklistStep, type FirstEvaluation, type Goal, type SystemType, type WorkspaceOnboarding,
} from "@/lib/evals/onboarding/config";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";

/* ----------------------------------------------------------- availability --- */

const Availability = createContext(false);

/** Provided by the shell from the server flag ONBOARDING_AUTOSTART. */
export function OnboardingAvailability({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <Availability.Provider value={enabled}>{children}</Availability.Provider>;
}

export function useOnboardingEnabled() {
  return useContext(Availability);
}

/* ----------------------------------------------------- workspace checklist --- */

type Update = OnboardingUpdate;

export type WorkspaceOnboardingHandle = {
  state: WorkspaceOnboarding | null;
  reload: () => Promise<void>;
  update: (body: Update) => Promise<WorkspaceOnboarding>;
};

/** The workspace's checklist and welcome (shared copy, ./workspace-onboarding-store). Optional everywhere: a failed read shows nothing. */
export function useWorkspaceOnboarding(orgId: string, refreshKey?: unknown): WorkspaceOnboardingHandle {
  const enabled = useOnboardingEnabled();
  const state = useOnboardingState(orgId, enabled, refreshKey);
  const reload = useCallback(() => loadWorkspaceOnboarding(orgId), [orgId]);
  const update = useCallback((body: Update) => updateWorkspaceOnboarding(orgId, body), [orgId]);
  return { state: state?.enabled ? state : null, reload, update };
}

const STEP_COPY: Record<ChecklistStep, { title: MessageKey; help: MessageKey; action: MessageKey }> = {
  connect: { title: "onbStepConnect", help: "onbStepConnectHelp", action: "onbActionConnect" },
  sources: { title: "onbStepSources", help: "onbStepSourcesHelp", action: "onbActionSources" },
  run: { title: "onbStepRun", help: "onbStepRunHelp", action: "onbActionRun" },
  results: { title: "onbStepResults", help: "onbStepResultsHelp", action: "onbActionResults" },
  invite: { title: "onbStepInvite", help: "onbStepInviteHelp", action: "onbActionInvite" },
};

function StepMark({ state, index }: { state: string; index: number }) {
  return (
    <span className="p-step-mark" aria-hidden="true">
      {state === "done" ? <CheckIcon /> : state === "blocked" ? "!" : index + 1}
    </span>
  );
}

/**
 * The five activation steps. `empty` is the empty-state version: always
 * shown (it is the empty state's guidance), never dismissable.
 */
export function OnboardingChecklist({ onboarding, variant = "card" }: { onboarding: WorkspaceOnboardingHandle; variant?: "card" | "empty" }) {
  const { canWrite, canManage, withOrg } = useWorkspace();
  const [pending, setPending] = useState(false);
  const state = onboarding.state;
  if (!state?.enabled) return null;
  if (variant === "card" && (!state.tracked || state.dismissed || state.complete)) return null;
  const first = state.firstEvaluationId ? withOrg(`/workspace/evaluations/${state.firstEvaluationId}`) : withOrg("/workspace/evaluations/new");
  const href: Record<ChecklistStep, string | null> = {
    connect: canWrite ? (state.firstEvaluationId ? first : withOrg("/workspace/evaluations/new")) : null,
    sources: canWrite ? first : null,
    run: canWrite && state.firstEvaluationId ? first : null,
    results: withOrg("/workspace/reports"),
    invite: canManage ? withOrg("/workspace/settings?tab=members") : null,
  };
  const current = CHECKLIST_STEPS.find((step) => !state.steps[step]);
  const done = CHECKLIST_STEPS.filter((step) => state.steps[step]).length;

  async function dismiss() {
    setPending(true);
    try {
      await onboarding.update({ action: "dismiss" });
      notify(t("onbChecklistHidden"));
    } catch (error) {
      notify(error instanceof Error ? error.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title={t("onbChecklistTitle")}
      actions={
        variant === "card" && canWrite ? (
          <Action variant="ghost" size="sm" onClick={() => void dismiss()} disabled={pending}>
            <X aria-hidden="true" />
            {t("onbHideChecklist")}
          </Action>
        ) : undefined
      }
    >
      <div className="p-stack" data-testid="onboarding-checklist">
        <p className="p-cell-meta">
          {t("onbChecklistHelp")} {tv("onbProgress", { done, total: CHECKLIST_STEPS.length })}
        </p>
        <ol className="p-checklist" aria-label={t("onbChecklistTitle")}>
          {CHECKLIST_STEPS.map((step, index) => {
            const stepState = state.steps[step] ? "done" : step === current ? "current" : "upcoming";
            const link = href[step];
            return (
              <li key={step} data-state={stepState}>
                <StepMark state={stepState} index={index} />
                <span className="p-checklist-text">
                  <span className="p-checklist-title">
                    {t(STEP_COPY[step].title)}
                    {stepState === "done" && <span className="sr-only">: {t("onbStepDone")}</span>}
                  </span>
                  <span className="p-checklist-meta">{t(STEP_COPY[step].help)}</span>
                </span>
                {stepState !== "done" && link && (
                  <span className="p-checklist-action">
                    {/* Under the empty state, whose "New evaluation" is the page's one primary action, every step is secondary. */}
                    <ActionLink variant={stepState === "current" && variant === "card" ? "primary" : "secondary"} size="sm" href={link}>
                      {step === "connect" && !state.firstEvaluationId ? t("onbActionStart") : t(STEP_COPY[step].action)}
                    </ActionLink>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {/* The example evaluation (launch L-33); renders nothing when it is off or hidden. The empty state already links it. */}
        {variant === "card" && <ExampleEvaluationLink />}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- welcome --- */

/** Two optional questions for the owner after the first sign-in. Skippable; never blocks. */
export function OnboardingWelcome({ onboarding }: { onboarding: WorkspaceOnboardingHandle }) {
  const { role } = useWorkspace();
  const [systemType, setSystemType] = useState<SystemType | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const state = onboarding.state;
  if (!state?.enabled || !state.welcome.pending || role !== "owner") return null;

  async function send(body: Update) {
    setPending(true);
    setError("");
    try {
      await onboarding.update(body);
      if (body.action === "answer") notify(t("onbWelcomeSaved"));
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title={t("onbWelcomeTitle")}>
      <div className="p-stack" data-testid="onboarding-welcome">
        <p className="p-cell-meta">{t("onbWelcomeHelp")}</p>
        <fieldset className="p-choice-group">
          <legend className="p-checklist-title">{t("onbSystemQuestion")}</legend>
          <div className="p-row">
            {SYSTEM_TYPES.map((value) => (
              <Chip key={value} active={systemType === value} disabled={pending} onClick={() => setSystemType((current) => (current === value ? null : value))}>
                {t(`onbSystem_${value}` as MessageKey)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="p-choice-group">
          <legend className="p-checklist-title">{t("onbGoalQuestion")}</legend>
          <div className="p-row">
            {GOALS.map((value) => (
              <Chip key={value} active={goal === value} disabled={pending} onClick={() => setGoal((current) => (current === value ? null : value))}>
                {t(`onbGoal_${value}` as MessageKey)}
              </Chip>
            ))}
          </div>
        </fieldset>
        {error && <Status error>{error}</Status>}
        <div className="p-row">
          <Action size="sm" onClick={() => void send({ action: "answer", systemType, goal })} disabled={pending || (!systemType && !goal)}>
            {t("onbWelcomeSave")}
          </Action>
          <Action variant="ghost" size="sm" onClick={() => void send({ action: "skip" })} disabled={pending}>
            {t("onbWelcomeSkip")}
          </Action>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------- first evaluation --- */

const GENERATING = new Set(["profiling", "profile_ready", "drafting", "draft_ready"]);
const STOPPED = new Set(["quarantined", "failed", "paused", "stopped"]);

/**
 * Polls one evaluation's first-run state. Reading it advances a pending
 * automatic start on the server, so an open page starts preparation as soon
 * as the site is read. Calls `onChanged` when preparation starts or moves on.
 */
export function useFirstEvaluation(orgId: string, evaluationId: string, onChanged: () => Promise<void>) {
  const enabled = useOnboardingEnabled();
  const [state, setState] = useState<FirstEvaluation | null>(null);
  const last = useRef<string>("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || !orgId) return;
    let live = true;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await evalRequest<FirstEvaluation>(`/evaluations/${evaluationId}/onboarding?orgId=${encodeURIComponent(orgId)}`);
        if (!live) return;
        setState(next);
        const signature = `${next.autostart?.status}:${next.generation?.status}:${next.site.state}:${next.connection.state}`;
        if (last.current && last.current !== signature) void onChanged().catch(() => {});
        last.current = signature;
        if (!next.autostart) return;
        const busy = next.autostart.status === "waiting" || next.connection.state === "checking" || next.site.state === "reading" || GENERATING.has(next.generation?.status ?? "");
        timer = window.setTimeout(() => void poll(), busy ? 4_000 : 20_000);
      } catch {
        if (live) timer = window.setTimeout(() => void poll(), 15_000);
      }
    };
    void poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [enabled, orgId, evaluationId, onChanged, version]);
  return { state, refresh: () => setVersion((value) => value + 1) };
}

type StepView = { key: string; title: string; state: "done" | "current" | "upcoming" | "blocked"; detail: string };

function recovery(state: FirstEvaluation): { message: string; connect: boolean } | null {
  const host = state.connection.host ?? state.site.host ?? "—";
  if (state.connection.state === "unreachable")
    return { message: state.connection.kind === "website" ? tv("onbRecoverUnreachable", { host }) : t("onbRecoverApi"), connect: false };
  if (state.site.state === "failed") return { message: tv("onbRecoverSite", { host: state.site.host ?? host }), connect: false };
  if (state.site.state === "none") return { message: t("onbRecoverNoPages"), connect: false };
  if (state.connection.state === "attention") {
    const code = state.connection.code ?? "";
    const message = code === "recipe_not_found" ? t("onbRecoverChatNotFound") : code === "browser_session_unavailable" ? t("onbRecoverLogin") : code === "captcha_present" ? t("onbRecoverCaptcha") : t("onbRecoverChat");
    return { message, connect: state.connection.kind === "website" };
  }
  if (state.autostart?.status === "blocked" && ["generation_unavailable", "budget_unavailable", "generation_refused"].includes(state.autostart.reasonCode ?? ""))
    return { message: t("onbRecoverGeneration"), connect: false };
  return null;
}

/**
 * The evaluation page's four-step "first evaluation" checklist with live
 * status, honest time ranges, "what happens next", recovery guidance and
 * "Get help". Renders only for an evaluation with an automatic start.
 */
export function FirstEvaluationPanel({
  orgId,
  evaluation,
  state,
  hasReport,
  reportHref,
  runStatus,
  onConnect,
  onHelp,
}: {
  orgId: string;
  evaluation: WorkspaceEvaluation;
  state: FirstEvaluation | null;
  hasReport: boolean;
  reportHref: string | null;
  runStatus: string | null;
  onConnect: () => void;
  onHelp: () => void;
}) {
  const [help, setHelp] = useState<"" | "sending" | "sent" | "failed">("");
  if (!state?.enabled || !state.autostart) return null;
  const autostart = state.autostart;
  const host = state.connection.host ?? state.site.host ?? "—";
  const pagesHost = state.site.host ?? host;

  const connection: StepView = {
    key: "connect",
    title: t("onbFirstConnect"),
    ...(state.connection.state === "ready"
      ? { state: "done", detail: tv("onbFirstConnectReady", { host }) }
      : state.connection.state === "checking"
        ? { state: "current", detail: tv("onbFirstConnectChecking", { host }) }
        : state.connection.state === "unreachable"
          ? { state: "blocked", detail: tv("onbFirstConnectUnreachable", { host }) }
          : state.connection.state === "attention"
            ? { state: "blocked", detail: tv("onbFirstConnectAttention", { host }) }
            : state.connection.state === "none"
              ? { state: "blocked", detail: t("onbFirstConnectNone") }
              : { state: "blocked", detail: t("onbFirstConnectUnchecked") }),
  };
  const site: StepView = {
    key: "site",
    title: t("onbFirstSite"),
    ...(state.site.state === "ready"
      ? { state: "done", detail: tv("onbFirstSiteReady", { host: pagesHost }) }
      : state.site.state === "reading"
        ? { state: "current", detail: tv("onbFirstSiteReading", { pages: autostart.pageLimit, host: pagesHost }) }
        : state.site.state === "failed"
          ? { state: "blocked", detail: tv("onbFirstSiteFailed", { host: pagesHost }) }
          : { state: "blocked", detail: t("onbFirstSiteNone") }),
  };
  const generation = state.generation;
  const approved = !!evaluation.selected_suite_version_id;
  const cases = autostart.maxCases ?? 50;
  const tests: StepView = {
    key: "tests",
    title: t("onbFirstTests"),
    ...(approved || hasReport || !!runStatus
      ? { state: "done", detail: t("onbFirstTestsReview") }
      : generation && GENERATING.has(generation.status)
        ? { state: "current", detail: tv("onbFirstTestsWriting", { done: generation.written, total: generation.target }) }
        : generation?.status === "needs_input"
          ? { state: "current", detail: t("onbFirstTestsInput") }
          : generation?.status === "needs_review"
            ? { state: "current", detail: t("onbFirstTestsReview") }
            : generation && STOPPED.has(generation.status)
              ? { state: "blocked", detail: t("onbFirstTestsStopped") }
              : autostart.status === "blocked"
                ? { state: "upcoming", detail: ["generation_unavailable", "budget_unavailable", "generation_refused"].includes(autostart.reasonCode ?? "") ? t("onbRecoverGeneration") : t("onbFirstTestsBlocked") }
                : { state: "upcoming", detail: tv("onbFirstTestsWaiting", { cases }) }),
  };
  const running = !!runStatus && ["queued", "running", "pause_requested", "cancel_requested", "paused"].includes(runStatus);
  const run: StepView = {
    key: "run",
    title: t("onbFirstRun"),
    ...(hasReport ? { state: "done", detail: t("onbFirstRunDone") } : running ? { state: "current", detail: t("onbFirstRunRunning") } : { state: approved ? "current" : "upcoming", detail: t("onbFirstRunWaiting") }),
  };
  const steps = [connection, site, tests, run];
  const fix = recovery(state);
  const next = hasReport
    ? t("onbNextDone")
    : running
      ? t("onbNextRunning")
      : fix
        ? t("onbNextBlocked")
        : generation?.status === "needs_review"
          ? t("onbNextReview")
          : t("onbNextPreparing");
  const helpOpen = help === "sent" || state.help?.status === "open";

  async function requestHelp() {
    setHelp("sending");
    try {
      await evalRequest(`/evaluations/${evaluation.id}/onboarding`, "POST", { orgId, action: "help" });
      setHelp("sent");
      notify(t("onbHelpSent"));
      onHelp();
    } catch {
      setHelp("failed");
    }
  }

  return (
    <section className="p-panel-block p-first-eval" aria-labelledby="first-evaluation-title" data-testid="first-evaluation">
      <div className="p-panel-block-head">
        <h2 id="first-evaluation-title">{t("onbFirstTitle")}</h2>
      </div>
      <div className="p-panel-block-body">
        <p>{t("onbFirstHelp")}</p>
        <ol className="p-checklist" aria-label={t("onbFirstTitle")} aria-live="polite">
          {steps.map((step, index) => (
            <li key={step.key} data-state={step.state}>
              <StepMark state={step.state} index={index} />
              <span className="p-checklist-text">
                <span className="p-checklist-title">{step.title}</span>
                <span className="p-checklist-meta">{step.detail}</span>
              </span>
              {step.key === "run" && hasReport && reportHref && (
                <span className="p-checklist-action">
                  <ActionLink size="sm" href={reportHref}>
                    {t("openReport")}
                    <ArrowRight aria-hidden="true" />
                  </ActionLink>
                </span>
              )}
            </li>
          ))}
        </ol>
        {fix && (
          <Status tone="warn">
            <span className="p-stack-tight">
              <span>{fix.message}</span>
              <span className="p-row">
                {fix.connect && (
                  <Action variant="secondary" size="sm" onClick={onConnect}>
                    <Plug aria-hidden="true" />
                    {t("onbActionConnect")}
                  </Action>
                )}
                {helpOpen ? (
                  <span className="p-cell-meta" role="status">{help === "sent" ? t("onbHelpSent") : t("onbHelpOpen")}</span>
                ) : (
                  <Action variant="secondary" size="sm" onClick={() => void requestHelp()} disabled={help === "sending"}>
                    <LifeBuoy aria-hidden="true" />
                    {help === "sending" ? t("onbHelpSending") : t("onbGetHelp")}
                  </Action>
                )}
              </span>
              {help === "failed" && <span role="alert">{t("onbHelpFailed")}</span>}
            </span>
          </Status>
        )}
        <div className="p-first-eval-next">
          <h3>{t("onbNextTitle")}</h3>
          <p>{next}</p>
          <p className="p-cell-meta">{t("onbRangesNote")}</p>
        </div>
      </div>
    </section>
  );
}
