import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { createWebsitePreview } from "@/lib/evals/repositories/intake";
import { intakeV2Enabled } from "@/lib/evals/intake/flags";
import { validatePublicDestination } from "@/lib/evals/connectors/egress";
import { EvalError } from "@/lib/evals/domain/errors";

export const runtime = "nodejs";

// "Import help centre" (launch L-34, INTAKE_V2_ENABLED): list a help centre's
// pages from its sitemap before anything is read. The browser worker builds
// the list through its egress proxy; GET …/preview/:id returns it.
export const POST = api(async (request, identity) => {
  if (!intakeV2Enabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const input = z.strictObject({
    orgId: z.uuid(), evaluationId: z.uuid(),
    url: z.string().url().max(2048),
    sitemapUrl: z.string().url().max(2048).nullable().optional(),
    pathPrefix: z.string().max(300).nullable().optional(),
  }).parse(await jsonBody(request));
  await requireWorkspace(identity, input.orgId, "write");
  const check = async (raw: string) => {
    let destination;
    try { destination = await validatePublicDestination(raw); }
    catch { throw new EvalError("DESTINATION_INVALID", 422, "Use a public HTTPS website URL without credentials, query parameters or fragments."); }
    if (destination.url.port) throw new EvalError("DESTINATION_INVALID", 422, "Use the website's standard HTTPS address.");
    return destination.url.href;
  };
  const url = await check(input.url);
  const sitemapUrl = input.sitemapUrl ? await check(input.sitemapUrl) : null;
  return createWebsitePreview({ orgId: input.orgId, actorId: identity.user.id }, { evaluationId: input.evaluationId, url, sitemapUrl, pathPrefix: input.pathPrefix ?? null }, request.headers.get("Idempotency-Key") ?? "");
});
