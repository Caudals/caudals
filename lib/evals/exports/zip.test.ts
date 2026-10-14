import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { randomBytes } from "node:crypto";
import { ZipLimitError, ZipWriter } from "./zip";

const LIMITS = { maxUncompressedBytes: 8 * 1024 * 1024, maxZipBytes: 8 * 1024 * 1024, maxEntries: 100 };

describe("ZipWriter", () => {
  it("writes an archive that standard readers open, with exact contents", async () => {
    const zip = new ZipWriter(LIMITS, new Date("2026-10-14T10:20:30Z"));
    const random = randomBytes(4096);
    await zip.add("README.txt", "Exportación de datos — ñ\n");
    await zip.add("reports/001-claims/report.html", "<p>" + "Evidence ".repeat(2000) + "</p>");
    await zip.add("runs/empty.jsonl", "");
    await zip.add("bin/random.bin", random);
    const archive = zip.finish();
    expect(archive.length).toBeLessThan(zip.uncompressedBytes);
    const read = await JSZip.loadAsync(archive);
    expect(Object.keys(read.files).sort()).toEqual(["README.txt", "bin/random.bin", "reports/001-claims/report.html", "runs/empty.jsonl"]);
    expect(await read.file("README.txt")!.async("string")).toBe("Exportación de datos — ñ\n");
    expect((await read.file("reports/001-claims/report.html")!.async("string")).length).toBe(18007);
    expect(await read.file("runs/empty.jsonl")!.async("string")).toBe("");
    expect(Buffer.from(await read.file("bin/random.bin")!.async("uint8array")).equals(random)).toBe(true);
    expect(zip.files.map((file) => file.path)).toEqual(["README.txt", "reports/001-claims/report.html", "runs/empty.jsonl", "bin/random.bin"]);
    expect(zip.files[0]).toMatchObject({ bytes: Buffer.byteLength("Exportación de datos — ñ\n"), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("refuses unsafe paths", async () => {
    const zip = new ZipWriter(LIMITS);
    for (const path of ["../x", "/abs", "a//b", "a/./b", "a/../b", "", "con trol"]) await expect(zip.add(path, "x")).rejects.toThrow("zip_path_invalid");
  });

  it("stops at each limit", async () => {
    const entries = new ZipWriter({ ...LIMITS, maxEntries: 2 });
    await entries.add("a", "1");
    await entries.add("b", "2");
    await expect(entries.add("c", "3")).rejects.toBeInstanceOf(ZipLimitError);
    const uncompressed = new ZipWriter({ ...LIMITS, maxUncompressedBytes: 1000 });
    await expect(uncompressed.add("a", "x".repeat(1001))).rejects.toMatchObject({ limit: "maxUncompressedBytes", message: "export_too_large" });
    const compressed = new ZipWriter({ ...LIMITS, maxZipBytes: 2048 });
    await expect(compressed.add("a", randomBytes(4096))).rejects.toMatchObject({ limit: "maxZipBytes" });
  });
});
