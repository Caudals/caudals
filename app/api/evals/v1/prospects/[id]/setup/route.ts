import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { completeSnapshotSetup, requireSnapshotOperator } from "@/lib/evals/repositories/prospects";

export const runtime = "nodejs";
// Finishes a setup that stopped part-way (each step is idempotent).
export const POST = api(async (request, identity) => {
  requireSnapshotOperator(identity);
  return completeSnapshotSetup(identity, z.uuid().parse(new URL(request.url).pathname.split("/").at(-2)));
});
