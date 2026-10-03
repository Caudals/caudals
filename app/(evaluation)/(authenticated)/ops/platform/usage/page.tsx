import { redirect } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { PlatformConsole } from "@/components/evals/platform-console";

export default async function Page() {
  const identity = await requirePageIdentity("/ops/platform/usage");
  if (!identity.platformRole) redirect("/workspace/evaluations");
  return <><PlatformConsole section="usage" admin={identity.platformRole === "platform_admin"} /></>;
}
