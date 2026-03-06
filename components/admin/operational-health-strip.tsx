import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  HelpCircle,
  OctagonAlert,
} from "lucide-react";
import type {
  AdminOperationalHealthSignalStatus,
  AdminOperationalHealthSnapshot,
} from "@/lib/actions/admin-actions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getServerTranslator } from "@/lib/i18n/server";

type StatusUi = {
  labelKey: string;
  icon: typeof CheckCircle2;
  badgeClassName: string;
  cardClassName: string;
};

const STATUS_UI: Record<AdminOperationalHealthSignalStatus, StatusUi> = {
  healthy: {
    labelKey: "Healthy",
    icon: CheckCircle2,
    badgeClassName: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cardClassName: "border-emerald-200/70 bg-emerald-50/40",
  },
  warning: {
    labelKey: "Warning",
    icon: AlertTriangle,
    badgeClassName: "bg-amber-100 text-amber-800 border-amber-200",
    cardClassName: "border-amber-200/70 bg-amber-50/40",
  },
  critical: {
    labelKey: "Critical",
    icon: OctagonAlert,
    badgeClassName: "bg-rose-100 text-rose-800 border-rose-200",
    cardClassName: "border-rose-200/70 bg-rose-50/40",
  },
  unknown: {
    labelKey: "Unknown",
    icon: HelpCircle,
    badgeClassName: "bg-slate-100 text-slate-700 border-slate-200",
    cardClassName: "border-slate-200/70 bg-slate-50/50",
  },
};

export async function OperationalHealthStrip({
  snapshot,
}: {
  snapshot: AdminOperationalHealthSnapshot;
}) {
  const t = await getServerTranslator();
  const overallUi = STATUS_UI[snapshot.overall_status] ?? STATUS_UI.unknown;
  const checkedLabel = formatDistanceToNow(new Date(snapshot.checked_at), {
    addSuffix: true,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("Operational health")}
          </p>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-slate-500" />
            <p className="text-sm text-slate-500">
              {t("Last checked")} {checkedLabel}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("border px-2.5 py-1 text-xs", overallUi.badgeClassName)}
        >
          {t(overallUi.labelKey)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {snapshot.signals.map((signal) => {
          const signalUi = STATUS_UI[signal.status] ?? STATUS_UI.unknown;
          const SignalIcon = signalUi.icon;

          return (
            <Link
              key={signal.id}
              href={signal.href}
              className={cn(
                "group rounded-xl border p-3 transition-colors hover:bg-background",
                signalUi.cardClassName
              )}
              data-dashboard-action={`admin_health_open_${signal.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t(signal.label)}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {t(signal.summary)}
                  </p>
                </div>
                <SignalIcon className="h-4 w-4 shrink-0 text-slate-500" />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="line-clamp-2">{t(signal.detail)}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
