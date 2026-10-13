import "server-only";
import { z } from "zod";
import { EvalError } from "@/lib/evals/domain/errors";
import { requireWorkspace, type EvalIdentity } from "@/lib/evals/domain/identity";
import { readoutAccess, type ReadoutAccess } from "@/lib/evals/readout/access";
import { readoutMode } from "@/lib/evals/readout/flags";

/** The report id in `/api/evals/v1/reports/<id>/readout[/…]`. */
export function readoutReportId(request: Request) {
  const parts = new URL(request.url).pathname.split("/");
  return z.uuid().parse(parts[parts.indexOf("reports") + 1]);
}

/**
 * Readout routes answer 404 while READOUT_MODE_ENABLED is off or the person
 * may not present, so the feature is invisible until it is theirs (L-35).
 */
export async function requireReadout(identity: EvalIdentity, orgId: string, need: keyof ReadoutAccess = "present"): Promise<ReadoutAccess> {
  await requireWorkspace(identity, orgId, "read");
  const role = identity.workspaces.find((workspace) => workspace.id === orgId)?.role ?? null;
  const access = readoutAccess(readoutMode(), role, identity.platformRole !== null);
  if (!access[need]) throw new EvalError("SCOPE_DENIED", 404);
  return access;
}
