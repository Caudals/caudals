/**
 * Download names for report files (launch L-17, spec P-22):
 * `Caudals-<system>-<YYYY-MM-DD>.<ext>`, e.g. `Caudals-Support-assistant-2026-10-12.pdf`.
 * The system name keeps its capitals; accents and anything outside letters,
 * digits and dashes are dropped so the name is safe in a Content-Disposition
 * header on every platform. Without a name the file is `Caudals-report-…`;
 * without a date it ends with the artifact's short ID instead.
 */
function slug(value: string | null) {
  return (value ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}
function isoDay(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
function extension(mediaType: string) {
  return mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? "docx"
    : mediaType === "application/pdf" ? "pdf"
    : mediaType.startsWith("text/csv") ? "csv"
    : mediaType.startsWith("text/markdown") ? "md"
    : mediaType.includes("jsonl") || mediaType.includes("ndjson") ? "jsonl"
    : mediaType === "application/json" ? "json"
    : "bin";
}
export function reportDownloadName(id: string, mediaType: string, name: string | null, date?: string | Date | null): string {
  return `Caudals-${slug(name) || "report"}-${isoDay(date) ?? id.slice(0, 8)}.${extension(mediaType)}`;
}
