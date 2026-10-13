/**
 * Drag and drop of reference documents (launch L-34, P-56): the checks made
 * before anything is uploaded. Pure, shared by the Prepare page and its tests.
 * The server repeats every limit (lib/evals/repositories/evidence.ts) and
 * answers a file already in the evaluation as a duplicate.
 */

/** The accepted types, by extension (unchanged by intake v2). */
export const INTAKE_MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
export const INTAKE_ACCEPT = Object.keys(INTAKE_MEDIA_TYPES).map((extension) => `.${extension}`).join(",");
export const INTAKE_MAX_FILES = 50;
export const INTAKE_MAX_FILE_BYTES = 25_000_000;
export const INTAKE_MAX_TOTAL_BYTES = 200_000_000;

export type IntakeFile = { name: string; size: number };
export type IntakeRejection = "type" | "empty" | "size" | "count" | "total";
export type IntakeCheck = { ok: true; mediaType: string } | { ok: false; reason: IntakeRejection };

export function mediaTypeFor(name: string): string | null {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  return name.includes(".") ? INTAKE_MEDIA_TYPES[extension] ?? null : null;
}

/**
 * Type and size first, then the evaluation's file and byte budget in drop
 * order. Every file gets exactly one verdict, so none is lost silently.
 */
export function checkIntake(files: readonly IntakeFile[], existing: { files: number; bytes?: number }): IntakeCheck[] {
  let count = existing.files;
  let bytes = existing.bytes ?? 0;
  return files.map((file): IntakeCheck => {
    const mediaType = mediaTypeFor(file.name);
    if (!mediaType) return { ok: false, reason: "type" };
    if (file.size < 1) return { ok: false, reason: "empty" };
    if (file.size > INTAKE_MAX_FILE_BYTES) return { ok: false, reason: "size" };
    if (count >= INTAKE_MAX_FILES) return { ok: false, reason: "count" };
    if (bytes + file.size > INTAKE_MAX_TOTAL_BYTES) return { ok: false, reason: "total" };
    count += 1;
    bytes += file.size;
    return { ok: true, mediaType };
  });
}

/**
 * Duplicates by content hash: a file whose bytes match an earlier file of the
 * batch, or a file already added in this session, is skipped. The first copy
 * wins. null hashes (files that failed a check) are ignored.
 */
export function duplicateVerdicts(hashes: ReadonlyArray<string | null>, known: ReadonlySet<string> = new Set()): Array<"new" | "batch" | "known" | null> {
  const seen = new Set<string>();
  return hashes.map((hash) => {
    if (!hash) return null;
    if (known.has(hash)) return "known";
    if (seen.has(hash)) return "batch";
    seen.add(hash);
    return "new";
  });
}

/** SHA-256 of a file's bytes, hex (the upload contract). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
