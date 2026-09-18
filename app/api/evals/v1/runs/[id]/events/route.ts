import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { getRun } from "@/lib/evals/repositories/managed";

export const runtime = "nodejs";
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const runId = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "read");
  const after = Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0);
  const run = await getRun({ orgId, actorId: identity.user.id }, runId);
  const events = run.events.filter((event: { id: number }) => event.id > after);
  const body = [
    ...events.map(
      (event: { id: number }) =>
        `id: ${event.id}\nevent: progress\ndata: ${JSON.stringify(event)}\n`,
    ),
    `event: snapshot\ndata: ${JSON.stringify({
      run: run.run,
      units: run.units.map((unit: { id: string; status: string; reason_code?: string }) => ({
        id: unit.id,
        status: unit.status,
        reason_code: unit.reason_code ?? null,
      })),
    })}\n`,
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
