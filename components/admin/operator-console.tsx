import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  KeyRound,
  Layers3,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Translator } from "@/lib/i18n/create-translator";
import type {
  BuildGate,
  DemoBuild,
  OperatorConsoleSnapshot,
  OperatorModuleSummary,
  OperatorModuleKey,
  OperatorWorkItem,
} from "@/lib/operator/console-snapshot";
import { cn } from "@/lib/utils";

type OperatorConsoleProps = {
  activeModuleKey: OperatorModuleKey;
  snapshot: OperatorConsoleSnapshot;
  t: Translator;
};

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

function severityClassName(severity: OperatorWorkItem["severity"]) {
  if (severity === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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
      className={cn(
        "group flex min-h-[178px] flex-col justify-between rounded-xl border bg-white p-4 transition-colors hover:border-gray-300",
        active ? "border-gray-900 ring-1 ring-gray-900/5" : "border-gray-200"
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-950">{t(module.title)}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
              {t(module.description)}
            </p>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-700" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {module.anchorRecords.slice(0, 3).map((record) => (
            <Badge
              key={record}
              variant="outline"
              className="rounded-full border-gray-200 bg-gray-50 px-2 font-mono text-[10px] text-gray-600"
            >
              {record}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
        <span className="font-medium text-gray-900">
          {module.totalRecords} {t("records")}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-1 font-medium",
            module.blockedRecords > 0
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          )}
        >
          {module.blockedRecords} {t("blocked")}
        </span>
      </div>
    </a>
  );
}

function BuildRow({ build, t }: { build: DemoBuild; t: Translator }) {
  const budgetPct = Math.min(100, Math.round((build.costUsedUsd / build.budgetUsd) * 100));

  return (
    <div className="grid gap-3 border-t border-gray-100 py-4 first:border-t-0 lg:grid-cols-[1.4fr_0.7fr_1fr] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-950">{build.title}</p>
          <Badge variant="outline" className="rounded-full border-gray-200 font-mono text-[10px]">
            {build.id}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {build.buyerBriefId} / {build.supplierOrgId} / {t("ETA")} {build.eta}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase text-gray-400">{t("Budget")}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-emerald-600" style={{ width: `${budgetPct}%` }} />
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

function WorkItemRow({ item, t }: { item: OperatorWorkItem; t: Translator }) {
  return (
    <div className="grid gap-3 border-t border-gray-100 py-4 first:border-t-0 lg:grid-cols-[0.8fr_1.3fr_0.75fr_0.9fr] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-gray-200 bg-gray-50 font-mono text-[10px] text-gray-600"
          >
            {item.recordType}
          </Badge>
          <Badge
            variant="outline"
            className={cn("rounded-full text-[10px]", severityClassName(item.severity))}
          >
            {t(item.severity)}
          </Badge>
        </div>
        <p className="mt-2 truncate font-mono text-xs text-gray-500">{item.id}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-950">{item.title}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{item.detail}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("State")}</p>
        <p className="mt-1 font-mono text-xs font-semibold text-gray-950">{item.state}</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t("Next action")}
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-950">{t(item.nextAction)}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" />
      </div>
    </div>
  );
}

export function OperatorConsole({ activeModuleKey, snapshot, t }: OperatorConsoleProps) {
  const featuredBuild = snapshot.featuredBuild;
  const activeModule =
    snapshot.modules.find((module) => module.key === activeModuleKey) ??
    snapshot.modules[0];
  const activeWorkItems = activeModule
    ? snapshot.workItems[activeModule.key] ?? []
    : [];
  const composed = snapshot.licensePreview.composed;
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
    <div className="space-y-8 pb-12">
      <header className="border-b border-gray-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              {t("Caudals Ops Console")}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              {t("Operator Console")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              {t(
                "The internal control room for leads, suppliers, buyers, builds, datasets, rights, commerce, operations, audit, and settings."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="shadow-none">
              <Search className="mr-2 h-4 w-4" />
              {t("Open command palette")}
              <span className="ml-2 rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                cmd K
              </span>
            </Button>
            <Button className="bg-gray-950 text-white shadow-none hover:bg-gray-800">
              <ListChecks className="mr-2 h-4 w-4" />
              {t("Bulk review")} 5
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label={t("Active blockers")} value={snapshot.triage.blockers} icon={AlertTriangle} tone="amber" />
        <Metric label={t("Overdue gates")} value={snapshot.triage.overdueGates} icon={Clock3} tone="red" />
        <Metric label={t("Releases this week")} value={snapshot.triage.releasesThisWeek} icon={CheckCircle2} tone="emerald" />
        <Metric label={t("Queued jobs")} value={snapshot.triage.queuedJobs} icon={Layers3} tone="blue" />
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-950">{t("Modules")}</p>
            <p className="text-sm text-gray-500">
              {t("All 13 Phase 1 operator modules are visible from one surface.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {snapshot.modules[0].savedViews.map((view) => (
              <Badge key={view} variant="outline" className="rounded-full border-gray-200 bg-white">
                {t(view)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.modules.map((module) => (
            <ModuleCard
              key={module.key}
              module={module}
              active={module.key === activeModule?.key}
              t={t}
            />
          ))}
        </div>
      </section>

      {activeModule ? (
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-950">
                  {t(activeModule.title)} / {t("Work queue")}
                </p>
                <p className="mt-1 text-sm text-gray-500">{t(activeModule.description)}</p>
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
          <div className="p-5">
            {activeWorkItems.length > 0 ? (
              activeWorkItems.map((item) => (
                <WorkItemRow key={`${item.moduleKey}-${item.recordType}-${item.id}`} item={item} t={t} />
              ))
            ) : (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                {t("No records need operator attention in this module.")}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-950">
                  {t("Build detail")} / {featuredBuild.title}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {featuredBuild.id} / {featuredBuild.buyerBriefId} / {featuredBuild.supplierOrgId}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full bg-emerald-50 text-emerald-700">
                  {t("Silver")}
                </Badge>
                <Badge className="rounded-full bg-blue-50 text-blue-700">
                  {t("QA pending")}
                </Badge>
                <Badge className="rounded-full bg-emerald-50 text-emerald-700">
                  {t("PII reviewed")}
                </Badge>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {featuredBuild.gates.map((gate) => (
                <div
                  key={gate.key}
                  className={cn(
                    "rounded-lg border p-3 text-center",
                    gateClassName(gate.state)
                  )}
                >
                  <p className="font-mono text-xs font-bold">{gate.key}</p>
                  <p className="mt-1 text-xs font-semibold">{t(gate.label)}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase">
                    {statusLabel(gate.state, t)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <p className="text-sm font-semibold text-gray-950">{t("QA scorecard")}</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tight text-gray-950">
                    {featuredBuild.qScore.toFixed(2)}
                  </span>
                  <span className="text-xs font-medium uppercase text-gray-400">
                    {t("composite")}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  {qaDimensions.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-t border-gray-100 py-2">
                      <span className="text-gray-500">{t(label)}</span>
                      <span className="font-mono font-semibold text-gray-950">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emerald-700" />
                  <p className="text-sm font-semibold text-gray-950">
                    {t("License composition")}
                  </p>
                </div>
                <div className="grid gap-2 text-xs">
                  {Object.entries(composed.permissions).map(([key, allowed]) => (
                    <div key={key} className="flex items-center justify-between border-t border-gray-100 py-2">
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
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold text-gray-950">{t("Concurrent demo builds")}</p>
            </div>
            <div>
              {snapshot.builds.map((build) => (
                <BuildRow key={build.id} build={build} t={t} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold text-gray-950">{t("Audit overlay")}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {snapshot.auditRows.map((row) => (
                <div key={row.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono font-semibold text-gray-950">{row.action}</span>
                    <span className="text-gray-400">{new Date(row.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-1 text-gray-500">{row.target}</p>
                  <p className="mt-1 text-gray-400">{row.actor}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">{t("Marquez-shaped lineage feed")}</p>
          </div>
          <div className="divide-y divide-gray-100">
            {snapshot.lineageEvents.map((event) => (
              <div key={event.id} className="grid gap-1 py-3 text-xs sm:grid-cols-[1fr_0.9fr]">
                <span className="font-mono font-semibold text-gray-950">{event.jobName}</span>
                <span className="font-mono text-gray-500">{event.datasetVersionId}</span>
                <span className="text-gray-500">{event.namespace}</span>
                <span className="text-gray-400">{event.emittedAt}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">{t("State-machine coverage")}</p>
          </div>
          <div className="grid gap-2">
            {Object.entries(snapshot.workflowCoverage).map(([workflow, states]) => (
              <div key={workflow} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="font-mono text-xs font-semibold text-gray-950">{workflow}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{states.join(" -> ")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
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
  icon: typeof AlertTriangle;
  tone: "amber" | "red" | "emerald" | "blue";
}) {
  const toneClassName = {
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className={cn("mb-4 flex h-9 w-9 items-center justify-center rounded-lg border", toneClassName)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold tracking-tight text-gray-950">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}
