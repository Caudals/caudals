/**
 * Posts written before Caudals moved to evaluation (September 2026). They were
 * removed from the repository and answer 410 Gone, so search engines drop them
 * and re-enabling the blog cannot bring them back. Slugs the Caudals Ops
 * archive still publishes are its editorial decision and are not listed here.
 */
export const RETIRED_BLOG_SLUGS: ReadonlySet<string> = new Set([
  "active-learning-guided-data-collection",
  "budgeting-a-dataset-collection-program",
  "how-much-data-to-fine-tune-a-model",
  "how-we-review-contributor-quality-signals",
  "launching-caudals-clearer-dataset-operations",
  "operational-playbooks-for-multimodal-datasets",
  "preference-data-rlhf",
  "synthetic-vs-human-data",
]);

/** True for `/blog/<slug>` when that post was retired. */
export function isRetiredBlogPath(barePathname: string) {
  const match = /^\/blog\/([^/]+)\/?$/.exec(barePathname);
  return Boolean(match && RETIRED_BLOG_SLUGS.has(match[1]));
}
