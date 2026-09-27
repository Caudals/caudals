import type { ReactNode } from "react";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { ShellFrame } from "./shell-frame";

/**
 * Server entry for the platform shell. Feature flags are read here, on the
 * server, so navigation never offers a screen that would answer 404.
 */
export function EvalShell({ identity, expert = false, children }: { identity: EvalIdentity; expert?: boolean; children: ReactNode }) {
  return (
    <ShellFrame identity={identity} expert={expert} features={{ experts: process.env.EVALS_EXPERT_WORK_ENABLED === "true" }}>
      {children}
    </ShellFrame>
  );
}
