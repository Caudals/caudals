import { z } from "zod";
import { analyticsHash, recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { getReadout } from "@/lib/evals/repositories/readout";
import { readoutReportId, requireReadout } from "@/lib/evals/readout/server";
export const runtime = "nodejs";

/** Record that a readout started (launch L-35, event `readout_presented`): once per person, revision and day. */
export const POST = api(async (request, identity) => {
  const input = z.strictObject({ orgId: z.uuid(), revisionId: z.uuid(), slideCount: z.number().int().min(1).max(40) }).parse(await jsonBody(request));
  await requireReadout(identity, input.orgId);
  // The revision must belong to this report and workspace.
  const state = await getReadout({ orgId: input.orgId, actorId: identity.user.id }, readoutReportId(request), input.revisionId, { notes: false });
  const day = new Date().toISOString().slice(0, 10);
  await recordProductEvent({ eventName: "readout_presented", source: "server", orgId: input.orgId, runId: state.revision.snapshot.run_id, eventKey: `${input.orgId}:${input.revisionId}:${identity.user.id}:${day}`, payload: { revision_hash: analyticsHash(input.revisionId).slice(0, 16), slide_count: input.slideCount } });
  return { recorded: true };
});
