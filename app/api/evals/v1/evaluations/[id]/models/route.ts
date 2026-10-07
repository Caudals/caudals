import { z } from "zod";
import { api, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { ENGINE_ROLES, clearEvaluationRoute, getEvaluationEngineSettings, setEngineRoute } from "@/lib/evals/repositories/engine-settings";
export const runtime = "nodejs";
const evaluationId = (request: Request) => z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
export const GET = api(async (request,identity) => {
  const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"read");
  return getEvaluationEngineSettings(identity,orgId,evaluationId(request));
});
export const PUT = api(async (request,identity) => {
  const {orgId,...route}=z.object({orgId:z.uuid()}).passthrough().parse(await jsonBody(request));
  await requireWorkspace(identity,orgId,"write");
  return setEngineRoute(identity,orgId,{...route,scope:"evaluation",evaluationId:evaluationId(request)});
});
export const DELETE = api(async (request,identity) => {
  const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"write");
  return clearEvaluationRoute(identity,orgId,evaluationId(request),z.enum([...ENGINE_ROLES,"all"]).parse(url.searchParams.get("role")));
});
