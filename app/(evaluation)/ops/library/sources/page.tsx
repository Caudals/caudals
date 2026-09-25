import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { OperatorLibrary } from "@/components/evals/operator-library";

export default async function Page() {
  const identity = await requirePageIdentity("/ops/library/sources");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return <EvalShell identity={identity}><OperatorLibrary section="sources" /></EvalShell>;
}
