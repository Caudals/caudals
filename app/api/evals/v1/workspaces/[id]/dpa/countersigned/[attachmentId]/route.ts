import { z } from "zod";
import { api, EvalError, jsonBody, requireWorkspace } from "@/lib/evals/domain/http";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";
import { openCountersigned, removeCountersigned } from "@/lib/legal/dpa-countersigned";

export const runtime = "nodejs";

/** The countersigned DPA PDF (launch L-32): owners and operations download it; operations remove it with a reason. */
function ids(request: Request) {
  const parts = new URL(request.url).pathname.split("/");
  return { orgId: z.uuid().parse(parts.at(-4)), id: z.uuid().parse(parts.at(-1)) };
}
function enabled() {
  if (!dataControlsEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
}

export const GET = api(async (request, identity) => {
  enabled();
  const { orgId, id } = ids(request);
  await requireWorkspace(identity, orgId, "read");
  const file = await openCountersigned(identity, orgId, id);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Caudals-DPA-${file.version}-countersigned.pdf"`,
      "Content-Length": String(file.bytes.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const DELETE = api(async (request, identity) => {
  enabled();
  const { orgId, id } = ids(request);
  const { reason } = z.strictObject({ reason: z.string().trim().min(3).max(500) }).parse(await jsonBody(request));
  await requireWorkspace(identity, orgId, "read");
  return removeCountersigned(identity, orgId, id, reason);
});
