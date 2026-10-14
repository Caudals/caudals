import { z } from "zod";
import { api, EvalError, requireWorkspace } from "@/lib/evals/domain/http";
import { dataControlsEnabled } from "@/lib/evals/data-controls/flags";
import { attachCountersigned, DPA_COUNTERSIGNED_MAX_BYTES } from "@/lib/legal/dpa-countersigned";

export const runtime = "nodejs";

/**
 * `POST /api/evals/v1/workspaces/:id/dpa/countersigned?acceptanceId=&fileName=`
 * (launch L-32, P-42 follow-up): Caudals operations attach a countersigned DPA
 * PDF (the request body, `application/pdf`, up to 10 MB) to the workspace's
 * acceptance record. Audited by the database function.
 */
export const POST = api(async (request, identity) => {
  if (!dataControlsEnabled()) throw new EvalError("NOT_FOUND", 404, "Not found.");
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.pathname.split("/").at(-3));
  const acceptanceId = z.uuid().parse(url.searchParams.get("acceptanceId"));
  if (!request.headers.get("content-type")?.startsWith("application/pdf")) throw new EvalError("INPUT_INVALID", 415, "Attach a PDF.");
  await requireWorkspace(identity, orgId, "read");
  const reader = request.body?.getReader();
  if (!reader) throw new EvalError("INPUT_INVALID", 400, "Attach a PDF.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DPA_COUNTERSIGNED_MAX_BYTES) {
        await reader.cancel();
        throw new EvalError("INPUT_INVALID", 413, "Attach a PDF of up to 10 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return attachCountersigned(identity, orgId, { acceptanceId, fileName: url.searchParams.get("fileName") ?? "", bytes: Buffer.concat(chunks) });
});
