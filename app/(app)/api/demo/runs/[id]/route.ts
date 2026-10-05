import { sha256 } from "@/lib/demo/client";
import { failure, json, tokenFor, UUID } from "@/lib/demo/http";
import { ensureDemoRunner } from "@/lib/demo/runner";
import { getRun } from "@/lib/demo/store";
import { viewOf } from "@/lib/demo/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One run, for the holder of its token. Answers 304 while nothing changed. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = UUID.test(id) ? tokenFor(request, id) : null;
  if (!token) return failure("not_found", 404);
  ensureDemoRunner();
  const run = await getRun(id, sha256(token));
  if (!run) return failure("not_found", 404);
  const etag = `"${run.version}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-store" } });
  return json(viewOf(run), { headers: { ETag: etag } });
}
