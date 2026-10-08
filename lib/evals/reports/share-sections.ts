/** Report sections a share can allow; everything else in the snapshot is identity (ids, dates, hash). */
export const SHARE_SECTIONS = ["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology", "results"] as const;
export type ShareSection = (typeof SHARE_SECTIONS)[number];

/** Which downloads a share can offer: the per-test files only make sense when the results travel. */
export function shareExportKinds(permitted: Iterable<string>): Array<"pdf" | "docx" | "csv" | "cef"> {
  return new Set(permitted).has("results") ? ["pdf", "docx", "csv", "cef"] : ["pdf", "docx"];
}
