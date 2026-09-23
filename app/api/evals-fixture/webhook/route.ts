import { z } from "zod";

export const runtime = "nodejs";

const eventSchema = z.object({
  event_id: z.string().min(1).max(200),
  event_kind: z.enum(["run_completed", "run_partial", "run_unknown", "regression", "inconclusive"]),
}).passthrough();

/** A bounded, side-effect-free receiver for Caudals-owned delivery checks. */
export async function POST(request: Request) {
  const id = request.headers.get("x-caudals-delivery-id");
  const timestamp = request.headers.get("x-caudals-timestamp");
  const signature = request.headers.get("x-caudals-signature");
  const moment = timestamp ? Date.parse(timestamp) : NaN;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !timestamp ||
      !Number.isFinite(moment) || Math.abs(Date.now() - moment) > 5 * 60_000 ||
      !signature || !/^v1=[0-9a-f]{64}$/.test(signature)) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  try {
    if (!request.body) throw new Error("empty_body");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
    eventSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
