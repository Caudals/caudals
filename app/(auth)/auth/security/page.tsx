import { redirect } from "next/navigation";

import { OperatorSecuritySetup } from "@/app/(auth)/auth/security/security-setup";
import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { getOperatorSecurityStatus } from "@/lib/auth/operator-security";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await requireCurrentOperator();
  const status = getOperatorSecurityStatus(session);
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/") ? next : "/admin";

  if (status.complete && next) {
    redirect(nextPath);
  }

  return (
    <OperatorSecuritySetup
      email={session.authUser.email}
      name={session.authUser.name}
      nextPath={nextPath}
      status={status}
    />
  );
}
