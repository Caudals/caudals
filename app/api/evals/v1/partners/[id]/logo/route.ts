import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { partnerLogo, removePartnerLogo, setPartnerLogo } from "@/lib/evals/partners/repository";

export const runtime = "nodejs";
const partnerId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));

/** The white-label logo for the dashboard preview (partner members). */
export const GET = api(async (request, identity) => {
  const logo = await partnerLogo(identity, partnerId(request));
  return new Response(new Uint8Array(logo.bytes), { headers: { "Content-Type": logo.mediaType, "Content-Length": String(logo.bytes.length), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", ETag: `"${logo.sha256}"` } });
});
/** Partner admins upload `{imageBase64}`: PNG or JPEG, at most 512 KB, 16–4,096 px a side. */
export const PUT = api(async (request, identity) => setPartnerLogo(identity, partnerId(request), await jsonBody(request, 800_512)));
export const DELETE = api(async (request, identity) => removePartnerLogo(identity, partnerId(request)));
