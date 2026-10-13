import { describe, expect, it } from "vitest";
import { checkIntake, duplicateVerdicts, INTAKE_ACCEPT, INTAKE_MAX_FILES, mediaTypeFor, sha256Hex } from "../../lib/evals/intake/upload-plan";

/** Launch L-34: drag and drop of up to 50 files, checked before upload and deduplicated by content hash. */
describe("document intake checks", () => {
  it("accepts only the types already accepted, by extension", () => {
    expect(INTAKE_ACCEPT).toBe(".txt,.md,.docx,.pdf,.csv,.xlsx");
    expect(mediaTypeFor("Policy.PDF")).toBe("application/pdf");
    expect(mediaTypeFor("notes.md")).toBe("text/markdown");
    for (const name of ["photo.png", "archive.zip", "slides.pptx", "README", "doc.", "legacy.doc"]) expect(mediaTypeFor(name)).toBeNull();
  });

  it("gives each of 50 mixed files exactly one verdict: valid ones go, duplicates are skipped, every failure is named", async () => {
    // 50 dropped files: 38 valid (6 of them byte-identical copies), 4 wrong types, 3 empty, 2 too large, 3 that hit the evaluation's file cap.
    const encoder = new TextEncoder();
    const files: Array<{ name: string; size: number; bytes: Uint8Array }> = [];
    for (let index = 0; index < 32; index++) {
      const bytes = encoder.encode(`Policy ${index}: refunds within ${index + 1} days.`);
      files.push({ name: `policy-${index}.${["txt", "md", "pdf", "docx", "csv", "xlsx"][index % 6]}`, size: bytes.length, bytes });
    }
    for (let index = 0; index < 6; index++) files.push({ name: `copy-of-policy-${index}.txt`, size: files[index].size, bytes: files[index].bytes });
    for (const name of ["a.png", "b.zip", "c.pptx", "d"]) files.push({ name, size: 10, bytes: encoder.encode("x") });
    for (const name of ["empty-1.txt", "empty-2.pdf", "empty-3.md"]) files.push({ name, size: 0, bytes: new Uint8Array() });
    for (const name of ["huge-1.pdf", "huge-2.docx"]) files.push({ name, size: 25_000_001, bytes: encoder.encode("large") });
    for (let index = 0; index < 3; index++) files.push({ name: `late-${index}.txt`, size: 5, bytes: encoder.encode(`late ${index}`) });
    expect(files).toHaveLength(50);

    // Twelve documents are already in the evaluation: 12 + 38 = 50 fit, the last three valid files exceed the cap.
    const checks = checkIntake(files, { files: 12 });
    expect(checks).toHaveLength(50);
    const reasons = checks.map((check) => (check.ok ? "ok" : check.reason));
    expect(reasons.filter((reason) => reason === "ok")).toHaveLength(38);
    expect(reasons.filter((reason) => reason === "type")).toHaveLength(4);
    expect(reasons.filter((reason) => reason === "empty")).toHaveLength(3);
    expect(reasons.filter((reason) => reason === "size")).toHaveLength(2);
    expect(reasons.slice(-3)).toEqual(["count", "count", "count"]);

    const hashes = await Promise.all(files.map(async (file, index) => (checks[index].ok ? sha256Hex(file.bytes.slice().buffer) : null)));
    const verdicts = duplicateVerdicts(hashes);
    expect(verdicts.filter((verdict) => verdict === "batch")).toHaveLength(6);
    // Every file is accounted for exactly once: uploaded, duplicate, or a named failure.
    const uploaded = verdicts.filter((verdict) => verdict === "new").length;
    const duplicates = verdicts.filter((verdict) => verdict === "batch" || verdict === "known").length;
    const failed = checks.filter((check) => !check.ok).length;
    expect(uploaded + duplicates + failed).toBe(50);
    expect(uploaded).toBe(32);
  });

  it("never lets the batch exceed 50 files or 200 MB", () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ name: `f${index}.txt`, size: 100 }));
    const checks = checkIntake(many, { files: 0 });
    expect(checks.filter((check) => check.ok)).toHaveLength(INTAKE_MAX_FILES);
    expect(checks.slice(50).every((check) => !check.ok && check.reason === "count")).toBe(true);
    const heavy = Array.from({ length: 10 }, (_, index) => ({ name: `f${index}.pdf`, size: 24_000_000 }));
    const byBytes = checkIntake(heavy, { files: 0 });
    expect(byBytes.filter((check) => check.ok)).toHaveLength(8);
    expect(byBytes.slice(8).every((check) => !check.ok && check.reason === "total")).toBe(true);
  });

  it("skips a file whose bytes were already added earlier in the session", () => {
    expect(duplicateVerdicts(["a", "b", null, "a"], new Set(["b"]))).toEqual(["new", "known", null, "batch"]);
  });
});
