import { z } from "zod";
import { api, jsonBody } from "@/lib/evals/domain/http";
import { createDraftForAdmin, listRevisionsForAdmin } from "@/lib/billing/api";
export const runtime = "nodejs";

// Price book (spec v2 §6.13, §6.16): platform admins only.
export const GET = api(async (request, identity) => listRevisionsForAdmin(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));
export const POST = api(async (request, identity) => createDraftForAdmin(request, identity, await jsonBody(request, 262_144)));
