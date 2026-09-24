import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractText } from "../../lib/evals/storage/text";

describe("bounded source extraction", () => {
  it("normalizes CSV rows with their headers into reviewable excerpts", async () => {
    const result = await extractText(Buffer.from('topic,answer\nrefund,\"Available within 30 days\"\n'), "text/csv");
    const text = result.chunks.map((chunk) => chunk.excerpt).join("");
    expect(result.extractionVersion).toBe("csv-table-v1");
    expect(text).toContain("topic: refund");
    expect(text).toContain("answer: Available within 30 days");
  });

  it("extracts the first worksheet while rejecting macro-enabled workbooks", async () => {
    const zip = new JSZip();
    zip.file("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Policy</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>Refund days</t></is></c><c r="B2"><v>30</v></c></row></sheetData></worksheet>');
    const result = await extractText(Buffer.from(await zip.generateAsync({ type: "uint8array" })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.extractionVersion).toBe("xlsx-table-v1");
    expect(result.chunks.map((chunk) => chunk.excerpt).join("")).toContain("Row 2: Policy: Refund days | Value: 30");
    const unsafe = new JSZip();
    unsafe.file("xl/vbaProject.bin", "macro");
    unsafe.file("xl/worksheets/sheet1.xml", "<worksheet/>");
    await expect(extractText(Buffer.from(await unsafe.generateAsync({ type: "uint8array" })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
      .rejects.toThrow();
  });
});
