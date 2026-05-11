"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import {
  grantCurrentOperatorElevation,
  revokeCurrentOperatorElevation,
  type OperatorElevationStatus,
} from "@/lib/actions/operator-elevation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type OperatorElevationCardProps = {
  initialStatus: OperatorElevationStatus;
};

const durationOptions = [15, 30, 60, 120];

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function OperatorElevationCard({
  initialStatus,
}: OperatorElevationCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeGrant = status.activeGrant;

  const handleGrant = () => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await grantCurrentOperatorElevation({
        reason,
        durationMinutes: Number(durationMinutes),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setStatus(result.status);
      setReason("");
      setFeedback("Production DB elevation granted and audit event recorded.");
    });
  };

  const handleRevoke = () => {
    if (!activeGrant) return;

    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await revokeCurrentOperatorElevation({
        elevationId: activeGrant.id,
        reason: "Operator revoked the active production DB elevation.",
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setStatus(result.status);
      setFeedback("Production DB elevation revoked and audit event recorded.");
    });
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold text-gray-950">
              Production DB JIT elevation
            </p>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Time-box production database access before enabling the enforced
            service-role console mode. Every grant and revoke writes an audit
            event with the operator reason.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={
              status.enforcementEnabled
                ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                : "rounded-full border-gray-200 bg-gray-50 text-gray-600"
            }
          >
            {status.enforcementEnabled ? "Enforced" : "Not enforced"}
          </Badge>
          <Badge
            variant="outline"
            className={
              activeGrant
                ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                : "rounded-full border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {activeGrant ? "Active grant" : "No active grant"}
          </Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-gray-950">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            Runtime status
          </div>
          <dl className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Scope</dt>
              <dd className="font-mono font-semibold text-gray-950">{status.scope}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Service role</dt>
              <dd className="font-mono font-semibold text-gray-950">
                {String(status.serviceRoleEnabled)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Target operator</dt>
              <dd className="max-w-[220px] truncate font-mono font-semibold text-gray-950">
                {status.targetOperatorId}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Current operator</dt>
              <dd className="max-w-[220px] truncate font-mono font-semibold text-gray-950">
                {status.currentOperatorId}
              </dd>
            </div>
          </dl>
          {!status.targetIsCurrentOperator ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 leading-5 text-amber-800">
              Grants target the configured service operator because the console
              reads production data through a fixed service-role identity.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-100 p-4">
          {activeGrant ? (
            <div>
              <p className="text-sm font-semibold text-gray-950">
                Active until {formatExpiry(activeGrant.expiresAt)}
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                {activeGrant.reason}
              </p>
              <p className="mt-2 font-mono text-xs text-gray-400">
                {activeGrant.id}
                {activeGrant.auditEventId ? ` / ${activeGrant.auditEventId}` : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-gray-200 bg-white shadow-none"
                disabled={!status.canManage || isPending}
                onClick={handleRevoke}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Revoke elevation
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="operator-elevation-reason">
                  Elevation reason
                </Label>
                <Textarea
                  id="operator-elevation-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={!status.canManage || isPending}
                  placeholder="Example: inspect live build queue after QA release incident"
                  className="min-h-24 border-gray-200 text-sm shadow-none"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-[180px_auto] sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="operator-elevation-duration">
                    Duration
                  </Label>
                  <Select
                    value={durationMinutes}
                    onValueChange={setDurationMinutes}
                    disabled={!status.canManage || isPending}
                  >
                    <SelectTrigger
                      id="operator-elevation-duration"
                      className="border-gray-200 bg-white shadow-none"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((duration) => (
                        <SelectItem key={duration} value={String(duration)}>
                          {duration} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  className="w-fit bg-gray-950 text-white shadow-none hover:bg-gray-800"
                  disabled={!status.canManage || isPending || reason.trim().length < 10}
                  onClick={handleGrant}
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Grant elevation
                </Button>
              </div>
              {!status.canManage ? (
                <p className="text-xs font-medium text-amber-700">
                  Admin or data engineer role required to manage production DB
                  elevation.
                </p>
              ) : null}
            </div>
          )}

          <div aria-live="polite" className="mt-3 min-h-5">
            {error ? (
              <p className="text-xs font-medium text-red-700">{error}</p>
            ) : feedback ? (
              <p className="text-xs font-medium text-emerald-700">{feedback}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
