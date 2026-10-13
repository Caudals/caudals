import { z } from "zod";
import { analyticsHash, recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { READOUT_MAX_TRANSCRIPTS, READOUT_NEXT_STEPS } from "@/lib/evals/reports/readout";
import { queueReadoutExport } from "@/lib/evals/repositories/readout";
import { readoutReportId, requireReadout } from "@/lib/evals/readout/server";
export const runtime = "nodejs";

/**
 * Queue the 16:9 readout PDF (launch L-35). The document worker renders it
 * from the snapshot and the deck sent here (transcripts and next step; what
 * is left out comes from the saved deck, then the defaults); notes are never
 * part of an export. Poll `/exports/<id>` and download through the
 * report-artifact gateway, as for the report PDF.
 */
export const POST = api(async (request, identity) => {
  const input = z.strictObject({
    orgId: z.uuid(),
    revisionId: z.uuid(),
    locale: z.enum(["en", "es"]).default("en"),
    transcriptIds: z.array(z.string().min(1).max(200)).min(1).max(READOUT_MAX_TRANSCRIPTS).nullable().optional(),
    nextStep: z.enum(READOUT_NEXT_STEPS).nullable().optional(),
  }).parse(await jsonBody(request));
  await requireReadout(identity, input.orgId);
  const result = await queueReadoutExport({ orgId: input.orgId, actorId: identity.user.id }, readoutReportId(request), input.revisionId, input.locale, { transcriptIds: input.transcriptIds, nextStep: input.nextStep });
  if (result.created) {
    await recordProductEvent({ eventName: "readout_exported", source: "server", orgId: input.orgId, eventKey: `${input.orgId}:${result.job.id}`, payload: { revision_hash: analyticsHash(input.revisionId).slice(0, 16), slide_count: result.slideCount } });
  }
  return result.job;
});
