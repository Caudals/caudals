import type { ReactNode } from "react";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { exampleEvaluationEnabled } from "@/lib/evals/example/flags";
import { ShellFrame } from "./shell-frame";
import { onboardingEnabled } from "@/lib/evals/onboarding/flags";
import { workspaceHomeEnabled } from "@/lib/evals/workspace/flags";
import { billingUiEnabled } from "@/lib/billing/billing-ui";
import { sectorPacksEnabled } from "@/lib/evals/sector-packs/flags";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";

/**
 * Server entry for the platform shell. Feature flags are read here, on the
 * server, so navigation never offers a screen that would answer 404.
 */
export function EvalShell({ identity, expert = false, children }: { identity: EvalIdentity; expert?: boolean; children: ReactNode }) {
  return (
    <ShellFrame identity={identity} expert={expert} features={{ growth: process.env.ANALYTICS_EVENTS_V2 === "true", experts: process.env.EVALS_EXPERT_WORK_ENABLED === "true", example: exampleEvaluationEnabled(), prospects: process.env.PROSPECT_SNAPSHOTS_ENABLED === "true", onboarding: onboardingEnabled(), home: workspaceHomeEnabled(), billing: billingUiEnabled(), sectorPacks: sectorPacksEnabled(), dataControls: dataControlsEnabled() }}>
      {children}
    </ShellFrame>
  );
}
