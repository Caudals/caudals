"use client";

/**
 * "Your provider key failed: <reason>" (launch L-27, spec v2 §6.11): work on
 * the workspace's own provider key stopped. Owners get a link to fix the key
 * in Settings → AI models; the work resumes by itself once a working key is
 * saved. Caudals never moves it to its own models (INV-11).
 */
import { KeyRound } from "lucide-react";
import { ActionLink, Status } from "./primitives";
import { useWorkspace } from "./workspace-context";
import { BYOK_FIX_PATH, type CustomerKeyReason } from "@/lib/evals/byok/shared";
import { t, tv, type MessageKey } from "@/lib/evals/messages/en";

export function customerKeyReasonText(reason: CustomerKeyReason) {
  return t(`keyReason_${reason}` as MessageKey);
}

export function CustomerKeyNotice({ reason }: { reason: CustomerKeyReason }) {
  const { role, platformAdmin, withOrg } = useWorkspace();
  const owner = role === "owner" || platformAdmin;
  const help = reason === "customer_key_revoked" ? t("keyFailedRevokedHelp") : owner ? t("keyFailedHelpOwner") : t("keyFailedHelpMember");
  return (
    <Status
      tone="error"
      action={owner ? (
        <ActionLink variant="secondary" size="sm" href={withOrg(BYOK_FIX_PATH)} data-testid="customer-key-fix">
          <KeyRound aria-hidden="true" />
          {t("keyFailedFix")}
        </ActionLink>
      ) : undefined}
    >
      <strong>{tv("keyFailedTitle", { reason: customerKeyReasonText(reason) })}</strong> {help}
    </Status>
  );
}
