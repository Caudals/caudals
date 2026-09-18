import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { ManagedEvaluationConsole } from "@/components/evals/managed-evaluation-console";
export default async function OpsEvaluationsPage(){const identity=await requirePageIdentity("/ops/evaluations");if(!identity.platformRole)redirect("/workspace/evaluations");return <EvalShell identity={identity}><ManagedEvaluationConsole/></EvalShell>;}
