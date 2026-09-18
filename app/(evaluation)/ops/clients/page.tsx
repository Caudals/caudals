import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { ClientManagement } from "@/components/evals/client-management";
export default async function OpsClientsPage(){const identity=await requirePageIdentity("/ops/clients");if(!identity.platformRole)redirect("/workspace/evaluations");return <EvalShell identity={identity}><ClientManagement/></EvalShell>;}
