import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { getProspectSnapshot } from "@/lib/evals/repositories/prospects";

export const runtime = "nodejs";
export const GET = api(async (request, identity) => getProspectSnapshot(identity, z.uuid().parse(new URL(request.url).pathname.split("/").at(-1))));
