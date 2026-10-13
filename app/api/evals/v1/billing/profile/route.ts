import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { getBillingProfile, profileInput, saveBillingProfile } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

// Owner: fiscal details (legal name, NIF or VAT ID with the VIES check,
// address, billing email). Businesses only (D-05).
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  return getBillingProfile(identity, orgId);
});

export const PUT = api(async (request, identity) => {
  const body = profileInput.parse(await jsonBody(request, 8192));
  return saveBillingProfile(identity, body, randomUUID());
});
