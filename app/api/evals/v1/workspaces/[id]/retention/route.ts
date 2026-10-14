import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";
import { getRetention, setRetention } from "@/lib/evals/data-controls/retention";

export const runtime = "nodejs";

/**
 * `/api/evals/v1/workspaces/:id/retention` (launch L-32, P-44): how long the
 * workspace keeps answers. Members read it (with `?preview=30|90|365`, the
 * read-only counts that period would mean now); owners change it.
 */
const days = z.union([z.literal(30), z.literal(90), z.literal(365)]);
function workspaceId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
}
function enabled() {
  if (!dataControlsEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
}

export const GET = api(async (request, identity) => {
  enabled();
  const orgId = workspaceId(request);
  const raw = new URL(request.url).searchParams.get("preview");
  const preview = raw === null ? undefined : days.parse(Number(raw));
  await requireWorkspace(identity, orgId, "read");
  return getRetention(identity, orgId, preview);
});

export const PUT = api(async (request, identity) => {
  enabled();
  const orgId = workspaceId(request);
  const input = z.strictObject({ observationDays: days.nullable() }).parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "read");
  return setRetention(identity, orgId, input.observationDays);
});
