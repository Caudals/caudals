import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { WorkspaceHome } from "@/components/evals/workspace-home";
import { workspaceHomeEnabled } from "@/lib/evals/workspace/flags";

/** Workspace Home (launch L-22, spec P-12): what needs you, scores per system, the next run, plan and shortcuts. */
export default async function WorkspaceHomePage() {
  await requirePageIdentity("/workspace/home");
  if (!workspaceHomeEnabled()) notFound();
  return <WorkspaceHome />;
}
