import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
export default async function EvaluationEntry() {
  const identity = await requirePageIdentity("/evaluation-entry");
  redirect(
    identity.platformRole === "operator" ||
      identity.platformRole === "platform_admin"
      ? "/ops"
      : identity.workspaces.length
        ? "/workspace/evaluations"
        : "/workspace/invitations",
  );
}
