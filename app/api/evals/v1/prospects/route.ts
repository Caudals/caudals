import { z } from "zod";
import { api, EvalError, jsonBody } from "@/lib/evals/domain/http";
import { TESTING_BASES } from "@/lib/evals/prospects/policy";
import { createProspectSnapshot, listProspectSnapshots, requireSnapshotOperator } from "@/lib/evals/repositories/prospects";

export const runtime = "nodejs";

// Prospect snapshots (launch L-21, spec v2 P-35). Platform operators and
// admins only, behind PROSPECT_SNAPSHOTS_ENABLED; 404 for everyone else.
export const GET = api(async (_request, identity) => {
  requireSnapshotOperator(identity);
  return listProspectSnapshots(identity);
});

const input = z.strictObject({
  company: z.string().trim().min(1).max(120),
  chatUrl: z.string().trim().min(8).max(2048),
  helpUrl: z.string().trim().min(8).max(2048),
  locale: z.enum(["en", "es"]),
  basis: z.enum(TESTING_BASES),
  basisNote: z.string().trim().max(500).optional(),
  packId: z.string().trim().min(1).max(80).optional(),
  // The operator confirms the third-party policy for this snapshot.
  confirmPolicy: z.literal(true),
});

export const POST = api(async (request, identity) => {
  requireSnapshotOperator(identity);
  const { confirmPolicy: _confirmed, ...body } = input.parse(await jsonBody(request, 8192));
  if (body.basis === "owner_permission" && !body.basisNote) throw new EvalError("INPUT_INVALID", 422, "Say who gave permission and when.");
  return createProspectSnapshot(identity, body, request.headers.get("idempotency-key") ?? "");
});
