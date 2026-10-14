import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { consentInputSchema, revokeInputSchema } from "@/lib/publication/contracts";
import { publicResultsEnabled } from "@/lib/publication/flags";
import { getPublicationStatus, recordConsent, revokeConsent } from "@/lib/publication/store";

export const runtime = "nodejs";

/**
 * `/api/evals/v1/reports/:id/publication` (launch L-31, spec v2 P-23): the
 * report's written consents for a public results page and the anonymous
 * sector index. Owners record and withdraw consent; workspace operators and
 * platform administrators read. Recording consent publishes nothing: the
 * founder reviews and publishes by hand. 404 while PUBLIC_RESULTS_ENABLED is off.
 */
const reportId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

function requireEnabled() {
  if (!publicResultsEnabled()) throw new EvalError("SCOPE_DENIED", 404, "This surface is not available.");
}

export const GET = api(async (request, identity) => {
  requireEnabled();
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity, orgId, "manage");
  return getPublicationStatus({ orgId, actorId: identity.user.id }, reportId(request));
});

/** An owner's written consent for one published revision. */
export const POST = api(async (request, identity) => {
  requireEnabled();
  const input = consentInputSchema.parse(await jsonBody(request, 8_192));
  await requireWorkspace(identity, input.orgId, "manage");
  return recordConsent({ orgId: input.orgId, actorId: identity.user.id }, reportId(request), input);
});

/** Withdraws a consent; a published page goes down at once. */
export const PATCH = api(async (request, identity) => {
  requireEnabled();
  const input = revokeInputSchema.parse(await jsonBody(request, 4_096));
  await requireWorkspace(identity, input.orgId, "manage");
  return revokeConsent({ orgId: input.orgId, actorId: identity.user.id }, reportId(request), input.consentId, input.reason ?? null);
});
