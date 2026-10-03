import { headers } from "next/headers";
import type { ReactNode } from "react";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { EvalShell } from "@/components/evals/shell";
import { PATHNAME_HEADER } from "@/lib/i18n/routing";

/** Keep workspace context, navigation and in-flight activity mounted between pages. */
export default async function AuthenticatedEvaluationLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "/workspace/evaluations";
  const identity = await requirePageIdentity(pathname);
  return <EvalShell identity={identity}>{children}</EvalShell>;
}
