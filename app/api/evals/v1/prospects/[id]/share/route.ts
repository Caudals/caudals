import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { shareProspectSnapshot } from "@/lib/evals/repositories/prospects";

export const runtime = "nodejs";
// A 30-day "external snapshot" link to the current published report; replaces any previous link.
export const POST = api(async (request, identity) => {
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const key = z.string().min(8).max(120).parse(request.headers.get("idempotency-key") ?? "");
  return shareProspectSnapshot(identity, id, key);
});
