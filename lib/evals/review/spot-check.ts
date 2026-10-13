/**
 * Faster test-set review (launch L-22, spec P-17). Free and pay-as-you-go
 * workspaces approve a generated test set after a spot check of ten
 * questions; managed (and partner) workspaces keep the full review. The
 * approval itself is attributed through the existing provenance: the
 * idempotent `approve-suite` request records its actor, and an
 * `evals.audit_event` (`suite.approved`) records the review mode and the
 * questions the person checked.
 *
 * Pure and client-safe: the review screen and the approval route share it.
 */

export const SPOT_CHECK_SIZE = 10;
export type ReviewMode = "spot_check" | "full";

/** Plans that default to the spot check. Anything else keeps the full review. */
const SPOT_CHECK_PLANS = new Set(["free", "payg"]);

export function reviewModeForPlan(plan: string | null | undefined): ReviewMode {
  return plan && SPOT_CHECK_PLANS.has(plan) ? "spot_check" : "full";
}

/** How many questions a spot check must cover for a set of `total` questions. */
export function spotCheckRequired(total: number) {
  return Math.max(0, Math.min(SPOT_CHECK_SIZE, total));
}

export type SpotCheckItem = { id: string; source: string | null; severity: string | null };

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Every question in spot-check order: one from each source page in turn
 * (pages in the order they first appear), the most severe first within a
 * page. A spot check takes the first ten, so it covers as many pages as it
 * can and the questions that matter most on each.
 */
export function spotCheckOrder(items: SpotCheckItem[]): string[] {
  const groups = new Map<string, Array<{ item: SpotCheckItem; index: number }>>();
  items.forEach((item, index) => {
    const key = item.source ?? "";
    const group = groups.get(key) ?? [];
    group.push({ item, index });
    groups.set(key, group);
  });
  const queues = [...groups.values()].map((group) =>
    group.sort((a, b) => (SEVERITY_RANK[a.item.severity ?? ""] ?? 4) - (SEVERITY_RANK[b.item.severity ?? ""] ?? 4) || a.index - b.index),
  );
  const order: string[] = [];
  for (let round = 0; order.length < items.length; round++)
    for (const queue of queues) if (queue[round]) order.push(queue[round].item.id);
  return order;
}

/**
 * The spot-check sample: the questions already in it that still exist (an
 * edited question keeps its place under its new id), topped up in
 * spot-check order when one was removed.
 */
export function spotCheckSample(items: SpotCheckItem[], current: string[] = [], size = SPOT_CHECK_SIZE): string[] {
  const exists = new Set(items.map((item) => item.id));
  const sample = current.filter((id, index) => exists.has(id) && current.indexOf(id) === index).slice(0, size);
  for (const id of spotCheckOrder(items)) {
    if (sample.length >= Math.min(size, items.length)) break;
    if (!sample.includes(id)) sample.push(id);
  }
  return sample;
}

/** The checked questions that are in the approved set; a spot check needs `spotCheckRequired` of them. */
export function coveredQuestions(checked: string[], approved: string[]) {
  const set = new Set(approved);
  return [...new Set(checked)].filter((id) => set.has(id));
}
