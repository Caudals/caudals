/** Report sections a share can allow; everything else in the snapshot is identity (ids, dates, hash). */
export const SHARE_SECTIONS = ["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology", "results"] as const;
export type ShareSection = (typeof SHARE_SECTIONS)[number];

/**
 * A vendor's fix-list link (launch P-54) records this one entry in place of
 * report sections. It never combines with them: the link opens the fix list
 * and its evidence, nothing else of the report.
 */
export const FIX_LIST_SCOPE = "fix_list";
export type ShareScope = "report" | typeof FIX_LIST_SCOPE;

/** The scope a share's recorded fields describe. */
export function shareScope(permitted: Iterable<string>): ShareScope {
  const fields = [...permitted];
  return fields.length === 1 && fields[0] === FIX_LIST_SCOPE ? FIX_LIST_SCOPE : "report";
}

/** Which downloads a share can offer: the per-test files only make sense when the results travel. A fix-list link has none on the server. */
export function shareExportKinds(permitted: Iterable<string>): Array<"pdf" | "docx" | "csv" | "cef"> {
  const fields = new Set(permitted);
  if (fields.has(FIX_LIST_SCOPE)) return [];
  return fields.has("results") ? ["pdf", "docx", "csv", "cef"] : ["pdf", "docx"];
}
