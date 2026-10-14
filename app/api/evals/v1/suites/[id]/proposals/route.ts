import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { requireSectorPacks } from "@/lib/evals/sector-packs/http";
import { decideProposals, listProposals } from "@/lib/evals/sector-packs/refresh";

export const runtime = "nodejs";

// Questions proposed this month from new or changed pages of the test set's sources.
export const GET = api(async (request, identity) => {
  requireSectorPacks();
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const suiteId = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "write");
  return listProposals({ orgId, actorId: identity.user.id }, suiteId);
});

// Approve proposals into a new test-set version and reject others (owners, editors, operators).
export const POST = api(async (request, identity) => {
  requireSectorPacks();
  const input = z.strictObject({ orgId: z.uuid(), approve: z.array(z.uuid()).max(100).default([]), reject: z.array(z.uuid()).max(100).default([]) })
    .refine((value) => value.approve.length + value.reject.length > 0, "Choose at least one question.").parse(await jsonBody(request));
  const suiteId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  await requireWorkspace(identity, input.orgId, "write");
  const key = z.string().min(8).max(200).parse(request.headers.get("Idempotency-Key"));
  return decideProposals({ orgId: input.orgId, actorId: identity.user.id }, suiteId, { approve: input.approve, reject: input.reject }, key);
});
