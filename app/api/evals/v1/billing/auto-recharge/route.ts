import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { autoRechargeInput, getAutoRechargeSettings, saveAutoRecharge } from "@/lib/billing/top-ups";

export const runtime = "nodejs";

// Owner: auto-recharge settings (spec §6.6): threshold, pack and monthly cap.
export const GET = api(async (request, identity) => {
  const orgId = z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  return getAutoRechargeSettings(identity, orgId);
});

export const PUT = api(async (request, identity) => {
  const body = autoRechargeInput.parse(await jsonBody(request, 2048));
  return saveAutoRecharge(identity, body, randomUUID());
});
