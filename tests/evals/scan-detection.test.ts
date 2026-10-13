import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { extractText, PDF_TYPE, pdfScanStats, ScannedPdfError } from "../../lib/evals/storage/text";
import { mostlyScannedPdf, scannedPdf, textPdf } from "./fixtures/pdf-fixtures";

const poppler = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

/** Launch L-34: a scanned PDF is flagged before generation from the Poppler extraction; no OCR. */
describe("scan heuristics", () => {
  it("flags under ~50 characters a page on average, or more than half the pages empty", () => {
    expect(pdfScanStats(["a".repeat(400), "b".repeat(300)])).toEqual({ pageCount: 2, textChars: 700, emptyPages: 0, suspected: false });
    expect(pdfScanStats(["Page 3", "", "  ", "12"]).suspected).toBe(true);
    expect(pdfScanStats(["x".repeat(2_000), "", "", ""])).toMatchObject({ emptyPages: 3, suspected: true });
    expect(pdfScanStats(["x".repeat(500), "x".repeat(500), "", ""]).suspected).toBe(false);
    expect(pdfScanStats(["x".repeat(50), "x".repeat(50)]).suspected).toBe(false);
    expect(pdfScanStats(["x".repeat(40), "x".repeat(40)]).suspected).toBe(true);
  });
});

describe.skipIf(!poppler)("scan detection with the real Poppler extraction", () => {
  it("does not flag a text PDF", async () => {
    const result = await extractText(textPdf(), PDF_TYPE);
    expect(result.scan).toMatchObject({ pageCount: 3, emptyPages: 0, suspected: false });
    expect(result.chunks.map((chunk) => chunk.excerpt).join("")).toContain("covered up to 3,000 euros");
  });

  it("names a PDF without any text as a scan, with its page statistics", async () => {
    const error = await extractText(scannedPdf(), PDF_TYPE).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ScannedPdfError);
    expect((error as ScannedPdfError).stats).toEqual({ pageCount: 4, textChars: 0, emptyPages: 4, suspected: true });
  });

  it("keeps the text of a mostly scanned PDF and flags it", async () => {
    const result = await extractText(mostlyScannedPdf(), PDF_TYPE);
    expect(result.scan).toMatchObject({ pageCount: 4, emptyPages: 3, suspected: true });
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("leaves other document types without a scan flag", async () => {
    const result = await extractText(Buffer.from("Refunds within 30 days."), "text/plain");
    expect(result.scan).toBeUndefined();
  });
});
