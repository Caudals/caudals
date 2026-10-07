"use client";

import { Check, Field, humanize } from "./primitives";
import { t } from "@/lib/evals/messages/en";

export type WorkspaceEntitlement = {
  max_active_runs: number;
  monthly_spend_limit: string;
  currency: string;
  allowed_connection_types: string[];
  can_schedule: boolean;
  can_export: boolean;
  review_allowance: number;
  version: number;
};

const CONNECTIONS = ["website", "openai_compatible", "provider_native", "https_json", "imported_responses", "private_runner"] as const;

/** Shared by platform Usage and workspace Settings; both use the audited admin API. */
export function EntitlementForm({ id, entitlement, pending, onSubmit }: {
  id: string;
  entitlement: WorkspaceEntitlement;
  pending: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  return (
    <form id={id} className="p-stack" onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      const form = new FormData(event.currentTarget);
      void onSubmit({
        targetKind: "entitlement",
        expectedVersion: entitlement.version,
        reason: form.get("reason"),
        maxActiveRuns: Number(form.get("maxActiveRuns")),
        monthlySpendLimit: form.get("monthlySpendLimit"),
        allowedConnectionTypes: CONNECTIONS.filter((kind) => form.has(`conn-${kind}`)),
        canSchedule: form.has("canSchedule"),
        canExport: form.has("canExport"),
        reviewAllowance: Number(form.get("reviewAllowance")),
      });
    }}>
      <fieldset className="p-fieldset p-stack" disabled={pending}>
        <div className="p-grid-2 p-form-grid">
          <Field id={`${id}-runs`} name="maxActiveRuns" type="number" min={0} max={100} step={1} required label={t("activeRunAllowance")} defaultValue={entitlement.max_active_runs} />
          <Field id={`${id}-limit`} name="monthlySpendLimit" label={`${t("monthlyLimit")} (${entitlement.currency})`} defaultValue={entitlement.monthly_spend_limit.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")} inputMode="decimal" pattern="(0|[1-9][0-9]{0,14})(\.[0-9]{1,9})?" required />
          <Field id={`${id}-review`} name="reviewAllowance" type="number" min={0} max={100000} step={1} required label={t("reviewAllowance")} defaultValue={entitlement.review_allowance} />
        </div>
        <fieldset className="p-fieldset p-checks p-checks-grid">
          <legend>{t("allowedConnections")}</legend>
          {CONNECTIONS.map((kind) => (
            <Check key={kind} name={`conn-${kind}`} defaultChecked={entitlement.allowed_connection_types.includes(kind)} label={humanize(kind)} />
          ))}
        </fieldset>
        <fieldset className="p-fieldset p-checks">
          <legend>{t("features")}</legend>
          <Check name="canSchedule" defaultChecked={entitlement.can_schedule} label={t("canSchedule")} />
          <Check name="canExport" defaultChecked={entitlement.can_export} label={t("canExport")} />
        </fieldset>
        <Field id={`${id}-reason`} name="reason" label={t("amendmentReason")} required minLength={3} maxLength={2000} />
      </fieldset>
    </form>
  );
}
