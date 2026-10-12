import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exampleEvaluationEnabled } from "@/lib/evals/example/flags";
import { SAMPLE_REPORT_PDF_FILES } from "@/lib/evals/example/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES = new Set(Object.values(SAMPLE_REPORT_PDF_FILES));

/**
 * `/sample-report/caudals-sample-report-en.pdf` and
 * `/sample-report/caudals-informe-de-ejemplo-es.pdf`: the sample report PDFs,
 * rendered from the example fixtures by the document worker's renderer
 * (scripts/evals/render-example-pdfs.ts) and committed in content/sample-report.
 * A path with an extension stays outside the locale tree, so this static
 * segment answers it. 404 while EXAMPLE_EVALUATION_ENABLED is off.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!exampleEvaluationEnabled() || !FILES.has(file)) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const body = await readFile(join(process.cwd(), "content/sample-report", file));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
