import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Gauge,
  KeyRound,
  Layers3,
  ListChecks,
  LockKeyhole,
  Route,
  ServerCog,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { OperatorElevationCard } from "@/components/admin/operator-elevation-card";
import { OperatorSecurityRosterCard } from "@/components/admin/operator-security-roster-card";
import { OperatorSigningKeyCard } from "@/components/admin/operator-signing-key-card";
import { OperatorWorkQueue } from "@/components/admin/operator-work-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperatorElevationStatus } from "@/lib/actions/operator-elevation-actions";
import type { OperatorSecurityRoster } from "@/lib/actions/operator-security-actions";
import type { Translator } from "@/lib/i18n/create-translator";
import type {
  BuildGate,
  DemoBuild,
  OperatorConsoleSnapshot,
  OperatorModuleKey,
  OperatorModuleSummary,
  OperatorServiceReadiness,
} from "@/lib/operator/console-snapshot";
import { cn } from "@/lib/utils";

type OperatorConsoleProps = {
  activeModuleKey: OperatorModuleKey;
  elevationStatus: OperatorElevationStatus | null;
  securityRoster: OperatorSecurityRoster | null;
  snapshot: OperatorConsoleSnapshot;
  t: Translator;
};

type ModuleGroup = {
  title: string;
  description: string;
  keys: OperatorModuleKey[];
};

const moduleGroups: ModuleGroup[] = [
  {
    title: "Intake",
    description: "Demand, supply, and triage.",
    keys: ["pipeline", "leads", "suppliers", "buyers"],
  },
  {
    title: "Dataset factory",
    description: "Builds, releases, and quality.",
    keys: ["builds", "datasets", "labeling", "quality", "privacy"],
  },
  {
    title: "Go-to-market",
    description: "Offers, money, service operations.",
    keys: ["catalogue", "commercials", "operations", "escalations"],
  },
  {
    title: "Control plane",
    description: "Audit evidence and console settings.",
    keys: ["audit", "settings"],
  },
];

function gateClassName(state: BuildGate["state"]) {
  if (state === "pass") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (state === "review") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  if (state === "blocked") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-gray-200 bg-gray-50 text-gray-500";
}

function statusLabel(state: BuildGate["state"], t: Translator) {
  if (state === "pass") return t("Pass");
  if (state === "review") return t("Review");
  if (state === "blocked") return t("Blocked");
  return t("Pending");
}

function readinessClassName(state: OperatorServiceReadiness["state"]) {
  if (state === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (state === "blocked") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function readinessLabel(state: OperatorServiceReadiness["state"], t: Translator) {
  if (state === "ready") return t("Ready");
  if (state === "blocked") return t("Blocked");
  return t("Review");
}

function moduleHealthClassName(blockedRecords: number) {
  if (blockedRecords >= 4) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (blockedRecords > 0) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function moduleHealthLabel(blockedRecords: number, t: Translator) {
  if (blockedRecords > 0) {
    return `${blockedRecords} ${t("Blocked")}`;
  }

  return t("Ready");
}

function readinessDotClassName(state: OperatorServiceReadiness["state"]) {
  if (state === "ready") {
    return "bg-emerald-500";
  }
  if (state === "blocked") {
    return "bg-red-500";
  }
  return "bg-amber-500";
}

function readinessCounts(readiness: OperatorServiceReadiness[]) {
  return readiness.reduce(
    (counts, item) => ({
      ...counts,
      [item.state]: counts[item.state] + 1,
    }),
    { ready: 0, review: 0, blocked: 0 }
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ConsoleAnchorNav({ t }: { t: Translator }) {
  const links = [
    { href: "#console-overview", label: "Overview", icon: Gauge },
    { href: "#console-workspace", label: "Active workspace", icon: ListChecks },
    { href: "#console-builds", label: "Build intelligence", icon: Activity },
    { href: "#console-evidence", label: "Evidence plane", icon: ShieldCheck },
  ];

  return (
    <nav
      aria-label={t("Operator console sections")}
      className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4"
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-white hover:text-gray-950"
        >
          <link.icon className="h-3.5 w-3.5 text-gray-400" />
          {t(link.label)}
        </a>
      ))}
    </nav>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "amber" | "red" | "emerald" | "blue";
}) {
  const toneClassName = {
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
  }[tone];

  return (
    <div className="bg-white p-3 sm:p-4">
      <div
        className={cn(
          "mb-3 flex h-8 w-8 items-center justify-center rounded-md border sm:h-9 sm:w-9",
          toneClassName
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="tabular-nums text-2xl font-bold text-gray-950">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase leading-3 text-gray-400 sm:text-xs">
        {label}
      </p>
    </div>
  );
}

function ModuleCard({
  module,
  active,
  t,
}: {
  module: OperatorModuleSummary;
  active?: boolean;
  t: Translator;
}) {
  return (
    <a
      href={`/admin?module=${module.key}`}
      data-module-card=""
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-16 min-w-0 items-center justify-between gap-3 overflow-hidden bg-white p-2.5 transition-colors hover:bg-gray-50",
        active ? "ring-1 ring-inset ring-gray-950" : ""
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-gray-950">
            {t(module.title)}
          </p>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
            {module.totalRecords}
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-gray-500">
          {module.anchorRecords.slice(0, 3).join(" / ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
            moduleHealthClassName(module.blockedRecords)
          )}
        >
          {moduleHealthLabel(module.blockedRecords, t)}
        </span>
        <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-700" />
      </div>
    </a>
  );
}

function ModuleDirectory({
  activeModule,
  modules,
  t,
}: {
  activeModule: OperatorModuleSummary;
  modules: OperatorModuleSummary[];
  t: Translator;
}) {
  const moduleMap = new Map(modules.map((module) => [module.key, module]));

  return (
    <section
      data-module-directory=""
      className="rounded-xl border border-gray-200 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">
            {t("Module directory")}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t("Workflow phase")}
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-gray-200 bg-gray-50 text-gray-600"
        >
          {modules.length} {t("Modules")}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {moduleGroups.map((group) => {
          const groupModules = group.keys
            .map((key) => moduleMap.get(key))
            .filter((module): module is OperatorModuleSummary => Boolean(module));
          const groupRecords = groupModules.reduce(
            (total, module) => total + module.totalRecords,
            0
          );
          const groupBlocked = groupModules.reduce(
            (total, module) => total + module.blockedRecords,
            0
          );

          return (
            <div
              key={group.title}
              className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
            >
              <div className="bg-gray-50/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-950">
                      {t(group.title)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      {t(group.description)}
                    </p>
                  </div>
                  <div className="text-right text-[10px] font-bold uppercase text-gray-400">
                    <p className="tabular-nums text-gray-950">{groupRecords}</p>
                    <p>{t("Records")}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 text-xs">
                  <span className="text-gray-500">{t("Active blockers")}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                      moduleHealthClassName(groupBlocked)
                    )}
                  >
                    {groupBlocked}
                  </span>
                </div>
              </div>
              <div className="grid gap-px">
                {groupModules.map((moduleSummary) => (
                  <ModuleCard
                    key={moduleSummary.key}
                    module={moduleSummary}
                    active={moduleSummary.key === activeModule.key}
                    t={t}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ServiceReadinessPanel({
  readiness,
  t,
}: {
  readiness: OperatorServiceReadiness[];
  t: Translator;
}) {
  const counts = readinessCounts(readiness);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              {t("Service readiness")}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t(
              "Production services mapped to owners, evidence, and live runtime signals."
            )}
          </p>
        </div>
        <Badge className="rounded-full bg-gray-950 text-white">
          {counts.ready}/{readiness.length} {t("Ready")}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-gray-100 text-center">
        {[
          { label: "Ready", value: counts.ready, className: "text-emerald-700" },
          { label: "Review", value: counts.review, className: "text-amber-700" },
          { label: "Blocked", value: counts.blocked, className: "text-red-700" },
        ].map((item) => (
          <div key={item.label} className="bg-white px-2 py-2">
            <p className={cn("tabular-nums text-lg font-bold", item.className)}>
              {item.value}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              {t(item.label)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y divide-gray-100">
        {readiness.map((item) => (
          <div
            id={item.id}
            key={item.id}
            className="grid scroll-mt-24 gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    readinessDotClassName(item.state)
                  )}
                />
                <p className="text-sm font-semibold text-gray-950">
                  {t(item.title)}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2 text-[10px] uppercase",
                    readinessClassName(item.state)
                  )}
                >
                  {readinessLabel(item.state, t)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                {t(item.description)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                <span>
                  <span className="font-semibold text-gray-700">
                    {t("Owner")}:
                  </span>{" "}
                  {item.owner}
                </span>
                <span>
                  <span className="font-semibold text-gray-700">
                    {t("Evidence")}:
                  </span>{" "}
                  <span className="font-mono">{item.evidence}</span>
                </span>
              </div>
            </div>
            <a
              href={`/admin?module=${item.moduleKey}#${item.id}`}
              className="inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-white"
            >
              {t("Open")}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturedBuildLane({
  build,
  t,
}: {
  build: DemoBuild;
  t: Translator;
}) {
  const budgetPct = Math.min(
    100,
    Math.round((build.costUsedUsd / build.budgetUsd) * 100)
  );

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-4 min-[1700px]:flex-row min-[1700px]:items-start min-[1700px]:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-700" />
            <p className="min-w-0 text-sm font-semibold text-gray-950">
              {t("Build detail")} / {build.title}
            </p>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-gray-500">
            {build.id} / {build.buyerBriefId} / {build.supplierOrgId}
          </p>
        </div>
        <div className="min-w-[180px]">
          <p className="text-xs font-medium uppercase text-gray-400">
            {t("Budget")}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-emerald-600"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {formatCurrency(build.costUsedUsd)} / {formatCurrency(build.budgetUsd)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {build.gates.map((gate) => (
          <div
            key={gate.key}
            className={cn("rounded-lg border p-3 text-center", gateClassName(gate.state))}
          >
            <p className="font-mono text-xs font-bold">{gate.key}</p>
            <p className="mt-1 text-xs font-semibold">{t(gate.label)}</p>
            <p className="mt-2 text-[10px] font-bold uppercase">
              {statusLabel(gate.state, t)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModuleWorkspace({
  activeModule,
  activeWorkItems,
  elevationStatus,
  securityRoster,
  serviceReadiness,
  showSettingsControls,
  t,
}: {
  activeModule: OperatorModuleSummary;
  activeWorkItems: OperatorConsoleSnapshot["workItems"][OperatorModuleKey];
  elevationStatus: OperatorElevationStatus | null;
  securityRoster: OperatorSecurityRoster | null;
  serviceReadiness: OperatorServiceReadiness[];
  showSettingsControls: boolean;
  t: Translator;
}) {
  const moduleServices = serviceReadiness.filter(
    (item) => item.moduleKey === activeModule.key
  );

  return (
    <section id="console-workspace" className="min-w-0 scroll-mt-24 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold text-gray-950">
                {t("Active workspace")}
              </p>
            </div>
            <p className="mt-1 text-sm font-semibold text-gray-950">
              {t(activeModule.title)}
            </p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
              {t(activeModule.description)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeModule.savedViews.map((view) => (
              <Badge
                key={view}
                variant="outline"
                className="rounded-full border-gray-200 bg-gray-50"
              >
                {t(view)}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <OperatorWorkQueue
            key={`${activeModule.key}-work-${activeModule.totalRecords}`}
            module={activeModule}
            initialItems={activeWorkItems}
          />
        </div>

        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-4 2xl:sticky 2xl:top-4">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              {t("Module operating brief")}
            </p>
          </div>
          <div className="mt-4 grid gap-3 text-xs">
            <BriefMetric
              label={t("Open work")}
              value={String(activeWorkItems.length)}
            />
            <BriefMetric
              label={t("Records")}
              value={String(activeModule.totalRecords)}
            />
            <BriefMetric
              label={t("Blocked")}
              value={String(activeModule.blockedRecords)}
            />
          </div>
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase text-gray-950">
              {t("Anchor records")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeModule.anchorRecords.map((record) => (
                <Badge
                  key={record}
                  variant="outline"
                  className="rounded-md border-gray-200 bg-gray-50 font-mono text-[10px]"
                >
                  {record}
                </Badge>
              ))}
            </div>
          </div>
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase text-gray-950">
              {t("Service dependencies")}
            </p>
            <div className="mt-2 space-y-2">
              {moduleServices.length > 0 ? (
                moduleServices.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-gray-600">{t(item.title)}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2 text-[10px] uppercase",
                        readinessClassName(item.state)
                      )}
                    >
                      {readinessLabel(item.state, t)}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs leading-5 text-gray-500">
                  {t("No direct service dependency is mapped.")}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      {showSettingsControls ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <OperatorSecurityRosterCard roster={securityRoster} t={t} />
          {elevationStatus ? (
            <OperatorElevationCard initialStatus={elevationStatus} />
          ) : null}
          <OperatorSigningKeyCard />
        </div>
      ) : null}
    </section>
  );
}

function BriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono font-semibold text-gray-950">{value}</span>
    </div>
  );
}

function BuildRow({ build, t }: { build: DemoBuild; t: Translator }) {
  const budgetPct = Math.min(
    100,
    Math.round((build.costUsedUsd / build.budgetUsd) * 100)
  );

  return (
    <div
      id={build.id}
      className="grid min-w-0 scroll-mt-24 gap-3 border-t border-gray-100 py-4 first:border-t-0 lg:grid-cols-[1.4fr_0.7fr_1fr] lg:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-950">{build.title}</p>
          <Badge
            variant="outline"
            className="max-w-full truncate rounded-full border-gray-200 font-mono text-[10px]"
          >
            {build.id}
          </Badge>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-gray-500">
          {build.buyerBriefId} / {build.supplierOrgId} / {t("ETA")} {build.eta}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase text-gray-400">
          {t("Budget")}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-emerald-600"
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {formatCurrency(build.costUsedUsd)} / {formatCurrency(build.budgetUsd)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {build.gates.map((gate) => (
          <span
            key={`${build.id}-${gate.key}`}
            className={cn(
              "rounded-md border px-2 py-1 text-[10px] font-bold uppercase",
              gateClassName(gate.state)
            )}
          >
            {gate.key}
          </span>
        ))}
      </div>
    </div>
  );
}

function QAScorecard({
  build,
  dimensions,
  t,
}: {
  build: DemoBuild;
  dimensions: string[][];
  t: Translator;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        <p className="text-sm font-semibold text-gray-950">{t("QA scorecard")}</p>
      </div>
      <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-gray-950">
          {build.qScore.toFixed(2)}
        </span>
        <span className="text-xs font-medium uppercase text-gray-400">
          {t("composite")}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 text-xs">
        {dimensions.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-t border-gray-100 py-2"
          >
            <span className="text-gray-500">{t(label)}</span>
            <span className="font-mono font-semibold text-gray-950">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LicensePanel({
  snapshot,
  t,
}: {
  snapshot: OperatorConsoleSnapshot;
  t: Translator;
}) {
  const composed = snapshot.licensePreview.composed;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-emerald-700" />
        <p className="text-sm font-semibold text-gray-950">
          {t("License composition")}
        </p>
      </div>
      <div className="grid gap-2 text-xs">
        {Object.entries(composed.permissions).map(([key, allowed]) => (
          <div
            key={key}
            className="flex items-center justify-between border-t border-gray-100 py-2"
          >
            <span className="font-mono text-gray-600">{key}</span>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full",
                allowed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-500"
              )}
            >
              {allowed ? t("Permitted") : t("Forbidden")}
            </Badge>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold">{t("Planner result")}</p>
        <p className="mt-1 leading-5">
          {snapshot.licensePreview.requestedUseAllowed
            ? t("Requested use is permitted.")
            : snapshot.licensePreview.requestedUseReasons.join(" ")}
        </p>
      </div>
    </div>
  );
}

function BuildIntelligence({
  snapshot,
  qaDimensions,
  t,
}: {
  snapshot: OperatorConsoleSnapshot;
  qaDimensions: string[][];
  t: Translator;
}) {
  return (
    <section id="console-builds" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-950">
            {t("Build intelligence")}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t(
              "Gate lane, quality, rights checks, and concurrent builds for the active delivery track."
            )}
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-gray-200 bg-white text-gray-600"
        >
          {snapshot.builds.length} {t("Builds")}
        </Badge>
      </div>
      <div className="grid min-w-0 gap-4 min-[1500px]:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 space-y-4">
          <QAScorecard
            build={snapshot.featuredBuild}
            dimensions={qaDimensions}
            t={t}
          />
          <LicensePanel snapshot={snapshot} t={t} />
        </div>
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              {t("Concurrent demo builds")}
            </p>
          </div>
          <div>
            {snapshot.builds.map((build) => (
              <BuildRow key={build.id} build={build} t={t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidencePlane({
  snapshot,
  t,
}: {
  snapshot: OperatorConsoleSnapshot;
  t: Translator;
}) {
  return (
    <section id="console-evidence" className="scroll-mt-24 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-950">
          {t("Evidence plane")}
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          {t(
            "Audit, lineage, and workflow coverage stay visible beside production operations."
          )}
        </p>
      </div>
      <div className="grid min-w-0 items-start gap-4 min-[1500px]:grid-cols-[0.8fr_1.2fr]">
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              {t("Audit overlay")}
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {snapshot.auditRows.map((row) => (
              <div id={row.id} key={row.id} className="scroll-mt-24 py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono font-semibold text-gray-950">
                    {row.action}
                  </span>
                  <span className="text-gray-400">
                    {new Date(row.createdAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-gray-500">{row.target}</p>
                <p className="mt-1 text-gray-400">{row.actor}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold text-gray-950">
                {t("Marquez-shaped lineage feed")}
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {snapshot.lineageEvents.map((event) => (
                <div
                  id={event.id}
                  key={event.id}
                  className="grid scroll-mt-24 gap-1 py-3 text-xs sm:grid-cols-[1fr_0.9fr]"
                >
                  <span className="truncate font-mono font-semibold text-gray-950">
                    {event.jobName}
                  </span>
                  <span className="truncate font-mono text-gray-500">
                    {event.datasetVersionId}
                  </span>
                  <span className="text-gray-500">{event.namespace}</span>
                  <span className="text-gray-400">{event.emittedAt}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold text-gray-950">
                {t("State-machine coverage")}
              </p>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {Object.entries(snapshot.workflowCoverage).map(([workflow, states]) => (
                <div key={workflow} className="border-t border-gray-100 pt-3">
                  <p className="font-mono text-xs font-semibold text-gray-950">
                    {workflow}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {states.join(" -> ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function OperatorConsole({
  activeModuleKey,
  elevationStatus,
  securityRoster,
  snapshot,
  t,
}: OperatorConsoleProps) {
  const activeModule =
    snapshot.modules.find((module) => module.key === activeModuleKey) ??
    snapshot.modules[0];

  if (!activeModule) {
    return null;
  }

  const activeWorkItems = snapshot.workItems[activeModule.key] ?? [];
  const qaDimensions = [
    ["Completeness", "0.99"],
    ["Accuracy", "0.86"],
    ["Validity", "0.98"],
    ["Representativeness", "0.82"],
    ["Consistency", "0.94"],
    ["Uniqueness", "0.97"],
    ["Privacy", "1.00"],
    ["Timeliness", "0.88"],
  ];

  return (
    <div className="space-y-4 pb-12 text-gray-950">
      <header className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              {t("Caudals Ops Console")}
              <span className="text-gray-300">/</span>
              <span className="text-gray-500">{t("Operations cockpit")}</span>
            </div>
            <h1 className="mt-3 text-3xl font-normal tracking-tight text-gray-950 sm:text-4xl">
              {t("Operator Console")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              {t(
                "Admin-only workspace for qualifying demand, governing rights, building datasets, and shipping licensed deliveries."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="h-9 rounded-md border-gray-200 bg-gray-50 px-3 text-gray-700"
            >
              {t("Current module")}: {t(activeModule.title)}
            </Badge>
            <Badge
              variant="outline"
              className="h-9 rounded-md border-gray-200 bg-gray-50 px-3 font-mono text-gray-600"
            >
              {t("Generated")}: {formatGeneratedAt(snapshot.generatedAt)}
            </Badge>
            <Button className="bg-gray-950 text-white shadow-none hover:bg-gray-800">
              <ListChecks className="mr-2 h-4 w-4" />
              {t("Bulk review")} 5
            </Button>
          </div>
        </div>
        <ConsoleAnchorNav t={t} />
      </header>

      <section
        id="console-overview"
        className="grid min-w-0 scroll-mt-24 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.38fr)] 2xl:grid-cols-[minmax(0,1.18fr)_minmax(380px,0.82fr)]"
      >
        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
            <div className="grid min-w-0 grid-cols-2 gap-px lg:grid-cols-4">
              <Metric
                label={t("Active blockers")}
                value={snapshot.triage.blockers}
                icon={AlertTriangle}
                tone="amber"
              />
              <Metric
                label={t("Overdue gates")}
                value={snapshot.triage.overdueGates}
                icon={Clock3}
                tone="red"
              />
              <Metric
                label={t("Releases this week")}
                value={snapshot.triage.releasesThisWeek}
                icon={CheckCircle2}
                tone="emerald"
              />
              <Metric
                label={t("Queued jobs")}
                value={snapshot.triage.queuedJobs}
                icon={Layers3}
                tone="blue"
              />
            </div>
          </div>
          <div className="grid min-w-0 gap-4 min-[1500px]:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
            <FeaturedBuildLane build={snapshot.featuredBuild} t={t} />
            <ModuleDirectory
              activeModule={activeModule}
              modules={snapshot.modules}
              t={t}
            />
          </div>
        </div>
        <ServiceReadinessPanel readiness={snapshot.serviceReadiness} t={t} />
      </section>

      <ModuleWorkspace
        activeModule={activeModule}
        activeWorkItems={activeWorkItems}
        elevationStatus={elevationStatus}
        securityRoster={securityRoster}
        serviceReadiness={snapshot.serviceReadiness}
        showSettingsControls={activeModuleKey === "settings"}
        t={t}
      />

      <BuildIntelligence
        snapshot={snapshot}
        qaDimensions={qaDimensions}
        t={t}
      />
      <EvidencePlane snapshot={snapshot} t={t} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <Route className="h-4 w-4 text-emerald-700" />
          <p className="mt-3 text-sm font-semibold text-gray-950">
            {t("Public funnel")}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t("LANDING_MODE route policy")}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <BadgeCheck className="h-4 w-4 text-emerald-700" />
          <p className="mt-3 text-sm font-semibold text-gray-950">
            {t("Dataset governance")}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t("G-1 to G-7 release gates")}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <p className="mt-3 text-sm font-semibold text-gray-950">
            {t("Access and identity")}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t("JIT audit events")}
          </p>
        </div>
      </div>
    </div>
  );
}
