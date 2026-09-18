import { manifestSchema, type Manifest } from "./manifest";
import { verifyContentHash } from "./hashing";

/** Validate together with historical/training releases before claiming an untouched split. */
export function validateFamilySplits(manifests: readonly Manifest[]): void {
  const families = new Map<string, string>();
  for (const input of manifests) {
    const manifest = manifestSchema.parse(input); verifyContentHash(manifest);
    for (const c of manifest.case_revisions) {
      const existing = families.get(c.family_id);
      if (existing && existing !== c.split) throw new Error(`Family split overlap across releases: ${c.family_id}`);
      families.set(c.family_id, c.split);
    }
  }
}
/** Storage must call this transactionally when a revision ID already exists. */
export function assertImmutableRevision(previous: { revision_id: string; content_hash: string }, next: { revision_id: string; content_hash: string }): void {
  verifyContentHash(previous); verifyContentHash(next);
  if (previous.revision_id === next.revision_id && previous.content_hash !== next.content_hash) throw new Error("Material edits require a new revision ID");
}
