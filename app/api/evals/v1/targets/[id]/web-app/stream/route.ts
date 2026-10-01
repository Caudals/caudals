import { z } from "zod";
import { api, requireWorkspace } from "@/lib/evals/domain/http";
import { browserControlStream } from "@/lib/evals/connectors/browser-control-client";
import { websiteControlEndpoint } from "@/lib/evals/repositories/web-app-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live remote-browser pixels and state as Server-Sent Events. Only the
 * workspace manager who opened the session receives them; nothing is cached
 * or logged. EventSource reconnects on its own when the stream rotates.
 */
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const sessionId = z.uuid().parse(url.searchParams.get("sessionId"));
  const targetId = z.uuid().parse(url.pathname.split("/").at(-3));
  await requireWorkspace(identity, orgId, "manage");
  const scope = { orgId, actorId: identity.user.id };
  const endpoint = await websiteControlEndpoint(scope, targetId);
  const upstream = new AbortController();
  request.signal.addEventListener("abort", () => upstream.abort(), { once: true });
  const messages = browserControlStream({ at: Date.now(), scope: { ...scope, targetId, endpoint }, sessionId }, upstream.signal);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await messages.next();
        if (next.done) { controller.close(); return; }
        const message = next.value as { type?: string };
        controller.enqueue(encoder.encode(message.type === "ping" ? ": ping\n\n" : `data: ${JSON.stringify(message)}\n\n`));
        if (message.type === "closed") controller.close();
      } catch {
        if (!upstream.signal.aborted) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "closed", reason: "browser_unavailable" })}\n\n`));
        controller.close();
      }
    },
    cancel() { upstream.abort(); void messages.return(undefined); },
  });
  return new Response(body, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform keeps compression from buffering frames.
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  } });
});
