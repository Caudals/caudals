import { z } from "zod";
import { api, EvalError, requireWorkspace } from "@/lib/evals/domain/http";
import { parseGradedRows } from "@/lib/evals/contracts/graded-results";
import { csvCell, tabularRecords } from "@/lib/evals/imports/structured";
import { GRADED_SHEET_HEADERS, gradedSheet, importGradedResults } from "@/lib/evals/repositories/graded-results";

export const runtime = "nodejs";

// Upload a complete results sheet (answers plus a person's verdicts) and publish its reviewed report.
export const POST = api(async (request, identity) => {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > 27_000_000) throw new EvalError("INPUT_INVALID", 413, "The sheet is too large.");
  const form = await request.formData();
  const orgId = z.uuid().parse(form.get("orgId"));
  const evaluationId = z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 25_000_000) throw new EvalError("INPUT_INVALID", 422, "Choose a CSV or XLSX file up to 25 MB.");
  const format = file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
  await requireWorkspace(identity, orgId, "write");
  let parsed;
  try {
    parsed = parseGradedRows((await tabularRecords(new Uint8Array(await file.arrayBuffer()), format)).records);
  } catch {
    throw new EvalError("INPUT_INVALID", 422, "The sheet could not be read. Save it as UTF-8 CSV or XLSX with the question sheet's headers.");
  }
  if (parsed.errors.length) {
    throw new EvalError("INPUT_INVALID", 422, `Check the sheet: ${parsed.errors.slice(0, 5).map((item) => `row ${item.rowNumber}: ${item.errors.join(", ")}`).join("; ")}.`);
  }
  return importGradedResults({ orgId, actorId: identity.user.id }, evaluationId, parsed.rows, request.headers.get("idempotency-key") ?? "");
});

// The grading sheet for the approved test set, in the columns POST expects.
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const orgId = z.uuid().parse(url.searchParams.get("orgId"));
  const evaluationId = z.uuid().parse(url.pathname.split("/").at(-2));
  await requireWorkspace(identity, orgId, "write");
  const rows = await gradedSheet({ orgId, actorId: identity.user.id }, evaluationId);
  const body = "\uFEFF" + [GRADED_SHEET_HEADERS.join(","), ...rows.map((row) => GRADED_SHEET_HEADERS.map((header) => csvCell(row[header])).join(","))].join("\r\n") + "\r\n";
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hoja-completa-${evaluationId}.csv"` } });
});
