import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { getEngineSettings } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";

// Settings → AI models: connections and the model behind each engine role.
export const GET = api(async (request, identity) =>
  getEngineSettings(identity, z.uuid().parse(new URL(request.url).searchParams.get("orgId"))));
