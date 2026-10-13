import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { landingPath } from "@/lib/evals/workspace/flags";
export default async function EvaluationEntry() {
  const identity = await requirePageIdentity("/evaluation-entry");
  // Workspace members land on Home when WORKSPACE_HOME_ENABLED is on (launch L-22).
  redirect(landingPath(identity));
}
