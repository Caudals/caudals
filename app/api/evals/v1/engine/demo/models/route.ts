import { api } from "@/lib/evals/domain/http";
import { listDemoModels } from "@/lib/evals/repositories/demo-settings";
export const runtime = "nodejs";

export const GET = api(async (_request, identity) => listDemoModels(identity));
