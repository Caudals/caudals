import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { READOUT_MAX_TRANSCRIPTS, READOUT_NEXT_STEPS, READOUT_NOTE_MAX, defaultNextStep } from "@/lib/evals/reports/readout";
import { getReadout, saveReadout, type ReadoutState } from "@/lib/evals/repositories/readout";
import { aiDisclosureCheckEnabled, withoutDisclosure } from "@/lib/evals/scoring/disclosure";
import { readoutReportId, requireReadout } from "@/lib/evals/readout/server";
export const runtime = "nodejs";

/**
 * Readout mode for one report revision (launch L-35): the snapshot, the saved
 * transcript picks and next step, and, for operators only, the presenter
 * notes. Notes are omitted for every other role, and row-level security
 * returns none to them anyway.
 */
function view(state: ReadoutState, access: Awaited<ReturnType<typeof requireReadout>>) {
  const snapshot = aiDisclosureCheckEnabled() ? state.revision.snapshot : withoutDisclosure(state.revision.snapshot);
  return {
    access,
    revision: { ...state.revision, snapshot },
    defaultNextStep: defaultNextStep(state.plan),
    deck: state.deck,
    ...(access.notes ? { notes: state.notes ?? {} } : {}),
  };
}

export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const revisionId = url.searchParams.get("revisionId") ? z.uuid().parse(url.searchParams.get("revisionId")) : null;
  const access = await requireReadout(identity, orgId);
  return view(await getReadout({ orgId, actorId: identity.user.id }, readoutReportId(request), revisionId, { notes: access.notes }), access);
});

const updateSchema = z.strictObject({
  orgId: z.uuid(),
  revisionId: z.uuid(),
  transcriptIds: z.array(z.string().min(1).max(200)).min(1).max(READOUT_MAX_TRANSCRIPTS).nullable().optional(),
  nextStep: z.enum(READOUT_NEXT_STEPS).nullable().optional(),
  notes: z.record(z.string().max(120), z.string().max(READOUT_NOTE_MAX).nullable()).optional(),
});

export const PUT = api(async (request, identity) => {
  const input = updateSchema.parse(await jsonBody(request, 131072));
  const access = await requireReadout(identity, input.orgId, "edit");
  const { orgId, revisionId, ...update } = input;
  return view(await saveReadout({ orgId, actorId: identity.user.id }, readoutReportId(request), revisionId, update), access);
});
