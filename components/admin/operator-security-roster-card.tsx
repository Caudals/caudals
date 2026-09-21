import { ShieldCheck, ShieldAlert } from "lucide-react";

import { OperatorSecurityResetButton } from "@/components/admin/operator-security-reset-button";
import { Badge } from "@/components/ui/badge";
import type { OperatorSecurityRoster } from "@/lib/actions/operator-security-actions";
import type { InternalTranslator } from "@/lib/i18n/internal";
import { cn } from "@/lib/utils";

type OperatorSecurityRosterCardProps = {
  roster: OperatorSecurityRoster | null;
  t: InternalTranslator;
};

function formatDate(value: string | null, t: InternalTranslator) {
  if (!value) {
    return t("No session");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusBadge(complete: boolean) {
  return complete
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function isResetEligibleOperator(operator: OperatorSecurityRoster["operators"][number]) {
  return (
    !operator.securityComplete &&
    (operator.mfaRequired || operator.webauthnRequired) &&
    !operator.email.toLowerCase().endsWith("@caudals.local")
  );
}

export function OperatorSecurityRosterCard({
  roster,
  t,
}: OperatorSecurityRosterCardProps) {
  const resetEligibleCount =
    roster?.operators.filter(isResetEligibleOperator).length ?? 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 xl:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              {t("Operator security enrollment")}
            </p>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            {t(
              "Tracks optional Better Auth MFA and passkey hardening for operator accounts. Password-only access is allowed by policy."
            )}
          </p>
        </div>
        {roster ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                {t("{{count}} complete", { count: roster.summary.complete })}
              </Badge>
              <Badge
                variant="outline"
                className={cn("rounded-full", statusBadge(roster.summary.actionNeeded === 0))}
              >
                {t("{{count}} action needed", {
                  count: roster.summary.actionNeeded,
                })}
              </Badge>
            </div>
            <OperatorSecurityResetButton
              actionLabel={t("Send reset link")}
              pendingCount={resetEligibleCount}
              sendingLabel={t("Sending...")}
            />
          </div>
        ) : null}
      </div>

      {roster ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-gray-100">
          <div className="grid grid-cols-[1.4fr_0.75fr_0.75fr_0.75fr] gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            <span>{t("Operator")}</span>
            <span>{t("MFA")}</span>
            <span>{t("Passkey")}</span>
            <span>{t("Last session")}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {roster.operators.map((operator) => (
              <div
                key={operator.id}
                className="grid grid-cols-[1.4fr_0.75fr_0.75fr_0.75fr] gap-3 px-3 py-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-gray-950">
                      {operator.name}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn("rounded-full text-[10px]", statusBadge(operator.securityComplete))}
                    >
                      {operator.securityComplete
                        ? t("complete")
                        : t("action needed")}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-gray-500">
                    {operator.email}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-gray-400">
                    {operator.role} / {operator.state}
                  </p>
                </div>
                <div className="text-gray-500">
                  <p className="font-semibold text-gray-950">
                    {operator.mfaEnabled ? t("Enabled") : t("Not enrolled")}
                  </p>
                  <p className="mt-1 text-[11px]">
                    {operator.mfaRequired ? t("Required") : t("Optional")}
                  </p>
                </div>
                <div className="text-gray-500">
                  <p className="font-semibold text-gray-950">
                    {operator.passkeyCount > 0
                      ? t("{{count}} registered", {
                          count: operator.passkeyCount,
                        })
                      : t("Not registered")}
                  </p>
                  <p className="mt-1 text-[11px]">
                    {operator.webauthnRequired ? t("Required") : t("Optional")}
                  </p>
                </div>
                <div className="font-mono text-[11px] leading-5 text-gray-500">
                  {formatDate(operator.lastSessionAt, t)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {t(
                "Operator security enrollment is visible only to admin operators."
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
