import { headers } from "next/headers";
import type { ReactNode } from "react";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { evalsPageMessages } from "@/components/evals/page-messages";
import { EvalShell } from "@/components/evals/shell";
import { PATHNAME_HEADER } from "@/lib/i18n/routing";

/**
 * Keep workspace context, navigation and in-flight activity mounted between
 * pages. The signed-in app gets every message in the reader's language once,
 * here, so client-side navigation between its pages needs no more (L-24c).
 */
export default async function AuthenticatedEvaluationLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "/workspace/evaluations";
  const identity = await requirePageIdentity(pathname);
  return (
    <>
      {await evalsPageMessages("all")}
      <EvalShell identity={identity}>{children}</EvalShell>
    </>
  );
}
