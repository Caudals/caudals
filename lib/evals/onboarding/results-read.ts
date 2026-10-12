import "server-only";
import type { PoolClient } from "pg";
import { onboardingEnabled } from "./flags";

/**
 * Checklist step "read results" (launch L-06): recorded the first time a
 * member of a tracked workspace opens a published report. The SQL function
 * ignores non-members (an operator reading in support) and untracked
 * workspaces. Runs in the caller's transaction and never fails the read.
 */
export async function markResultsRead(db: PoolClient, orgId: string) {
  if (!onboardingEnabled()) return;
  await db.query("SAVEPOINT onboarding_results_read");
  try {
    await db.query("SELECT 1 FROM evals.update_workspace_onboarding($1,'results_read',NULL,NULL)", [orgId]);
    await db.query("RELEASE SAVEPOINT onboarding_results_read");
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT onboarding_results_read");
    await db.query("RELEASE SAVEPOINT onboarding_results_read");
  }
}
