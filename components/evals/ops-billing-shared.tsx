"use client";

/** Shared helpers of the ops billing console (L-16): formatting, actions with re-authentication, request keys. */
import { useCallback, useState } from "react";
import { EvalRequestError } from "./api";
import { Status, formatMoney } from "./primitives";
import { notify } from "./overlays";
import { useReauth } from "./reauth";
import { t } from "@/lib/evals/messages/runtime";

/** Credits as people read them (grouped, at most two decimals). */
export const credits = (value: string | number | null | undefined) => (value == null ? "—" : formatMoney(value));
export const euros = (cents: number | null | undefined) => (cents == null ? "—" : `${formatMoney(cents / 100)} €`);
export const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : "—");

/**
 * Runs a console action: a sensitive change asks for a fresh sign-in and is
 * retried once with the same Idempotency-Key. `work` returns the toast text.
 */
export function useOpsAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reauth = useReauth();
  const { confirm } = reauth;
  const run = useCallback(async (work: () => Promise<string>) => {
    setPending(true);
    setError(null);
    try {
      let message: string;
      try {
        message = await work();
      } catch (reason) {
        if (!(reason instanceof EvalRequestError && reason.code === "REAUTHENTICATION_REQUIRED") || !(await confirm())) throw reason;
        message = await work();
      }
      notify(message);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
      return false;
    } finally {
      setPending(false);
    }
  }, [confirm]);
  const messages = <>{reauth.dialog}{error ? <Status error>{error}</Status> : null}</>;
  return { run, pending, messages, clear: () => setError(null) };
}

/** A new Idempotency-Key for one submission (its re-authentication retry reuses it). */
export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export type Outcome = { outcome: "done" | "pending_approval"; approval?: { id: string } };
export const outcomeMessage = (result: Outcome, done: string) => (result.outcome === "pending_approval" ? t("billingOpsSentForApproval") : done);


/** A workspace's billing account in the console. */
export function accountHref(orgId: string) {
  return `/ops/platform/billing?view=accounts&org=${encodeURIComponent(orgId)}`;
}

/** A workspace plan as the Clients list names it. */
export const planLabel = (plan: string | null | undefined) =>
  t(plan === "free" ? "clientPlanFree" : plan === "payg" ? "clientPlanPayg" : plan === "partner" ? "clientPlanPartner" : "clientPlanManaged");

/** The tax treatment of an order or invoice (spec §6.14). */
export const treatmentLabel = (value: string) =>
  value === "es_vat" ? t("billingOpsTreatmentEsVat") : value === "eu_reverse_charge" ? t("billingOpsTreatmentEuReverse") : value === "non_eu_not_subject" ? t("billingOpsTreatmentNonEu") : value;
