import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { PlatformConsole } from "@/components/evals/platform-console";

export default async function Page() {
  const identity = await requirePageIdentity("/ops/platform/audit");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return <><PlatformConsole section="audit" admin={identity.platformRole === "platform_admin"} /></>;
}
