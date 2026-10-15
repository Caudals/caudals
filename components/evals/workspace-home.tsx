"use client";

/**
 * Workspace Home (launch L-22, spec P-12): one page that says what needs the
 * customer, how each system scored lately, when the next run is, the plan, and
 * where to go next. Everything comes from the one workspace summary the other
 * screens read, so it loads with a single request; "needs your action" is the
 * evaluations list's own stage projection (`evaluationRows`), never a copy.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, FileText, FlaskConical, ListChecks, Minus, Plug, Plus, Settings } from "lucide-react";
import { Action, ActionLink, Badge, DefinitionList, PageHeading, Status, StatusBadge, Time, humanize } from "./primitives";
import { percent } from "./charts";
import { ExampleEvaluationLink, useExampleEvaluation } from "./example-evaluation-links";
import { NoWorkspace } from "./workspace-evaluations";
import { useWorkspace } from "./workspace-context";
import { connectionLabel, evaluationRows, useWorkspaceSummary, type WorkspaceSummary, type WorkspaceSystem } from "./workspace-data";
import { nextStepHint } from "./evaluation-stage";
import { HEALTH_LABEL, scoreHistory, systemHealth, trendPoints, type ScorePoint } from "@/lib/evals/workspace/health";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { useBilling } from "./billing-state";
import { PlanBalance } from "./workspace-billing";

/** At most this many rows per card; the rest are one link away. */
const LIMIT = 6;

const PLAN_LABEL: Record<string, MessageKey> = { free: "planFree", payg: "planPayg", managed: "planManaged", partner: "planPartner" };
const PLAN_HELP: Record<string, MessageKey> = { free: "planFreeHelp", payg: "planPaygHelp", managed: "planManagedHelp", partner: "planPartnerHelp" };

export function WorkspaceHome({ balance = null }: { /** Plan and credit balance (launch L-15); nothing until billing shows it. */ balance?: ReactNode } = {}) {
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const { summary, error, retry, loading } = useWorkspaceSummary(orgId);

  if (!workspace) return <NoWorkspace />;
  return (
    <>
      <PageHeading
        title={t("home")}
        actions={
          canWrite ? (
            <ActionLink href={withOrg("/workspace/evaluations/new")}>
              <Plus aria-hidden="true" />
              {t("newEvaluationAction")}
            </ActionLink>
          ) : undefined
        }
      >
        {workspace.name}
      </PageHeading>
      {error && (
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>
          {error}
        </Status>
      )}
      {!summary ? (
        loading ? <HomeSkeleton /> : null
      ) : (
        <div className="p-home" data-testid="workspace-home">
          <NeedsAction summary={summary} />
          <SystemScores summary={summary} />
          <NextRun summary={summary} />
          <PlanCard summary={summary} balance={balance} />
          <Shortcuts summary={summary} />
        </div>
      )}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="p-home" role="status" aria-label={t("loading")}>
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="p-skeleton p-home-skeleton" />
      ))}
    </div>
  );
}

function HomeCard({ id, title, count, icon, wide = false, action, children }: { id: string; title: string; count?: number; icon: ReactNode; wide?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="p-card p-home-card" aria-labelledby={id} {...(wide ? { "data-wide": "true" } : {})}>
      <div className="p-home-card-head">
        <span className="p-home-card-icon" aria-hidden="true">{icon}</span>
        <h2 id={id}>{title}</h2>
        {count != null && <Badge tone={count ? "warn" : "neutral"}>{count}</Badge>}
        {action && <span className="p-home-card-action">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------------------------------- needs action --- */

function NeedsAction({ summary }: { summary: WorkspaceSummary }) {
  const { withOrg } = useWorkspace();
  const rows = evaluationRows(summary).filter((row) => row.stage.needsAction);
  return (
    <HomeCard
      id="home-action"
      title={t("homeNeedsAction")}
      count={rows.length || undefined}
      icon={<FlaskConical />}
      wide
      action={rows.length > LIMIT ? <Link className="p-link" href={withOrg("/workspace/evaluations?filter=action")}>{tv("homeSeeAll", { n: rows.length })}</Link> : undefined}
    >
      {rows.length ? (
        <ul className="p-home-list" aria-label={t("homeNeedsAction")}>
          {rows.slice(0, LIMIT).map(({ evaluation, system, stage }) => {
            const step = nextStepHint(evaluation, stage);
            return (
              <li key={evaluation.id} className="p-home-item">
                <span className="p-home-item-main">
                  <Link className="p-row-link" href={withOrg(`/workspace/evaluations/${evaluation.id}`)}>{evaluation.title}</Link>
                  <span className="p-cell-meta">{[system?.title, step ? t(step) : null].filter(Boolean).join(" · ")}</span>
                </span>
                <Badge tone={stage.tone} dot live={stage.live}>{stage.label}</Badge>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-cell-meta">{summary.evaluations.length ? t("homeNothingNeeded") : t("homeNoEvaluations")}</p>
      )}
    </HomeCard>
  );
}

/* --------------------------------------------------------- system scores --- */

function SystemScores({ summary }: { summary: WorkspaceSummary }) {
  const { withOrg, canWrite } = useWorkspace();
  const systems = summary.systems;
  return (
    <HomeCard
      id="home-scores"
      title={t("homeLatestScores")}
      icon={<Plug />}
      wide
      action={systems.length > LIMIT ? <Link className="p-link" href={withOrg("/workspace/systems")}>{tv("homeSeeAll", { n: systems.length })}</Link> : undefined}
    >
      {systems.length ? (
        <ul className="p-home-list" aria-label={t("homeLatestScores")}>
          {systems.slice(0, LIMIT).map((system) => (
            <SystemScore key={system.id} system={system} history={scoreHistory(summary.reports, (report) => report.target_id === system.id)} />
          ))}
        </ul>
      ) : (
        <div className="p-stack">
          <p className="p-cell-meta">{t("homeNoSystems")}</p>
          {canWrite && (
            <div>
              <ActionLink variant="secondary" size="sm" href={withOrg("/workspace/evaluations/new")}>
                <Plus aria-hidden="true" />
                {t("connectSystemAction")}
              </ActionLink>
            </div>
          )}
        </div>
      )}
    </HomeCard>
  );
}

function SystemScore({ system, history }: { system: WorkspaceSystem; history: ScorePoint[] }) {
  const { withOrg } = useWorkspace();
  const health = systemHealth(system);
  const latest = history[0];
  return (
    <li className="p-home-item">
      <span className="p-home-item-main">
        <Link className="p-row-link" href={withOrg(`/workspace/systems?system=${system.id}`)}>{system.title}</Link>
        <span className="p-cell-meta">
          {connectionLabel(system.document.kind)}
          {health !== "manual" && <> · <StatusBadge value={health} label={t(HEALTH_LABEL[health])} /></>}
        </span>
      </span>
      {latest ? (
        <span className="p-home-score">
          <Trend history={history} />
          <Link className="p-home-score-value" href={withOrg(`/workspace/reports/${latest.reportId}`)} aria-label={tv("homeLatestScoreOf", { system: system.title, score: percent(latest.rate) })}>
            {percent(latest.rate)}
          </Link>
        </span>
      ) : (
        <span className="p-cell-meta">{t("homeNoScore")}</span>
      )}
    </li>
  );
}

/** The last three runs, oldest to newest, and the change across them. */
function Trend({ history }: { history: ScorePoint[] }) {
  const delta = trendPoints(history);
  if (delta == null) return null;
  const runs = [...history].reverse().map((point) => percent(point.rate)).join(" → ");
  const tone = delta > 0 ? "pass" : delta < 0 ? "fail" : "neutral";
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <span className="p-home-trend" title={runs}>
      <span className="p-cell-meta p-home-trend-runs">{runs}</span>
      <Badge tone={tone}>
        <Icon aria-hidden="true" />
        <span className="sr-only">{tv("homeTrendRuns", { runs })}: </span>
        {delta > 0 ? tv("homeTrendUp", { n: delta }) : delta < 0 ? tv("homeTrendDown", { n: -delta }) : t("homeTrendSame")}
      </Badge>
    </span>
  );
}

/* --------------------------------------------------------------- next run --- */

function NextRun({ summary }: { summary: WorkspaceSummary }) {
  const { withOrg, canManage } = useWorkspace();
  const next = summary.next_run;
  return (
    <HomeCard id="home-next-run" title={t("homeNextRun")} icon={<CalendarClock />}>
      {next ? (
        <div className="p-stack">
          <Link className="p-row-link" href={withOrg(`/workspace/evaluations/${next.evaluation_id}`)}>{next.evaluation_title}</Link>
          <p className="p-home-when"><Time value={next.next_due_at} /></p>
          <p className="p-cell-meta">{humanize(next.cadence)} · {next.timezone}</p>
        </div>
      ) : (
        <div className="p-stack">
          <p className="p-cell-meta">{summary.entitlement.can_schedule ? t("homeNoSchedule") : t("homeSchedulingOff")}</p>
          {summary.entitlement.can_schedule && canManage && (
            <div>
              <Link className="p-link" href={withOrg("/workspace/settings?tab=monitoring")}>{t("homeScheduleAction")}</Link>
            </div>
          )}
        </div>
      )}
    </HomeCard>
  );
}

/* ------------------------------------------------------------------ plan --- */

function PlanCard({ summary, balance: given }: { summary: WorkspaceSummary; balance: ReactNode }) {
  const { withOrg } = useWorkspace();
  // Launch L-15: the balance from the billing summary, where billing shows.
  const { summary: billing } = useBilling();
  const balance = given ?? (billing ? <PlanBalance /> : null);
  const plan = summary.entitlement.plan ?? null;
  return (
    <HomeCard id="home-plan" title={t("homePlan")} icon={<FileText />} action={<Link className="p-link" href={withOrg("/workspace/settings?tab=general")}>{t("homePlanDetails")}</Link>}>
      <div className="p-stack">
        {plan && (
          <p className="p-row">
            <Badge tone="strong">{PLAN_LABEL[plan] ? t(PLAN_LABEL[plan]) : humanize(plan)}</Badge>
            {PLAN_HELP[plan] && <span className="p-cell-meta">{t(PLAN_HELP[plan])}</span>}
          </p>
        )}
        {/* The credit balance (launch L-15) renders here; Home never shows a number billing has not given it. */}
        {balance && <div className="p-home-balance">{balance}</div>}
        <DefinitionList
          items={[
            { term: t("homeRunsAtOnce"), value: String(summary.entitlement.max_active_runs) },
            { term: t("homeScheduling"), value: summary.entitlement.can_schedule ? t("homeIncluded") : t("homeNotIncluded") },
          ]}
        />
      </div>
    </HomeCard>
  );
}

/* ------------------------------------------------------------- shortcuts --- */

function Shortcuts({ summary }: { summary: WorkspaceSummary }) {
  const { withOrg, canWrite } = useWorkspace();
  const example = useExampleEvaluation();
  const links: Array<{ href: string; label: string; icon: ReactNode }> = [
    ...(canWrite ? [{ href: "/workspace/evaluations/new", label: t("newEvaluationAction"), icon: <Plus /> }] : []),
    { href: "/workspace/evaluations", label: t("product"), icon: <FlaskConical /> },
    { href: "/workspace/systems", label: t("systems"), icon: <Plug /> },
    { href: "/workspace/reports", label: summary.reports.length ? `${t("reports")} (${summary.reports.length})` : t("reports"), icon: <FileText /> },
    { href: "/workspace/test-sets", label: t("testSets"), icon: <ListChecks /> },
    { href: "/workspace/settings", label: t("settings"), icon: <Settings /> },
  ];
  return (
    <HomeCard id="home-shortcuts" title={t("homeShortcuts")} icon={<ArrowRight />}>
      <ul className="p-home-shortcuts">
        {links.map((link) => (
          <li key={link.href}>
            <Link className="p-home-shortcut" href={withOrg(link.href)}>
              {link.icon}
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="p-cell-meta p-keyboard-hint">{t("homePaletteHint")}</p>
      {example.visible && <p><ExampleEvaluationLink /></p>}
    </HomeCard>
  );
}
