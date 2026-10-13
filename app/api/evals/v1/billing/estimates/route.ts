import { api, EvalError, jsonBody, privateHeaders } from "@/lib/evals/domain/http";
import { inputError } from "@/lib/evals/domain/errors";
import { estimateForMember, estimateForToken } from "@/lib/billing/api";
import { customerApiErrorHeaders } from "@/lib/evals/monitoring/tokens";
import { ZodError } from "zod";
export const runtime = "nodejs";

// Run estimate (spec v2 §6.7, §6.16): editors in the app and CI tokens.
// Behind BILLING_ESTIMATES_ENABLED ("operators" first, then "true").
const memberPost = api(async (request, identity) => estimateForMember(request, identity, await jsonBody(request)));

export async function POST(request: Request) {
  if (!/^Bearer evct_/.test(request.headers.get("authorization") ?? "")) return memberPost(request);
  try {
    return Response.json({ data: await estimateForToken(request, await jsonBody(request)) }, { headers: privateHeaders });
  } catch (caught) {
    const error = inputError(caught) ?? caught;
    const known = error instanceof EvalError, validation = error instanceof ZodError || error instanceof SyntaxError;
    return Response.json(
      { error: { code: known ? error.code : validation ? "INPUT_INVALID" : "SERVICE_UNAVAILABLE", message: known ? error.message : validation ? "Check the supplied fields." : "The service is temporarily unavailable." } },
      { status: known ? error.status : validation ? 400 : 503, headers: { ...privateHeaders, ...customerApiErrorHeaders(error) } },
    );
  }
}
