import { redirect } from "next/navigation";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { getOperatorSecurityStatus } from "@/lib/auth/operator-security";

export async function requireAdmin() {
  const session = await requireCurrentOperator();
  const security = getOperatorSecurityStatus(session);

  if (!security.complete) {
    redirect("/auth/security?next=/admin");
  }

  return session;
}
