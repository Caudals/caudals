import {
  INDEX_SECTORS,
  isIndexSector,
  MIN_COHORT,
  MIN_SCORED_PER_SYSTEM,
  type IndexSector,
  type SectorAggregates,
} from "./contracts";

/**
 * The anonymous sector index (launch L-31, spec v2 P-53, D-16): pure
 * aggregation of the identifier-free rows `evals.sector_index_inputs(quarter)`
 * returns. Only our own public snapshots and customers who consented in
 * writing are inputs; the database counts each system once and says why a row
 * cannot count.
 *
 * Rules (published on the index page):
 * - a sector with fewer than {@link MIN_COHORT} systems is suppressed: no
 *   figure of any kind is computed for it;
 * - each system contributes its strict pass rate once; the edition shows the
 *   median and the middle half (25th–75th percentile), never a minimum or a
 *   maximum, which would describe a single system;
 * - answer shares are pooled over every scored answer in the sector;
 * - every figure is a whole percentage.
 *
 * The output is built field by field from counts, so nothing an input row
 * carries beyond them (a name, a host, an id) can reach it.
 */

export type IndexExclusion = "no_sector" | "incomplete" | "weak_evidence";

/** One row of evals.sector_index_inputs (numeric columns may arrive as strings). */
export type SectorIndexInput = {
  sector: string | null;
  source: string;
  eligible: boolean;
  exclusion: string | null;
  n_scorable: number | string;
  n_pass: number | string;
  n_partial: number | string;
  n_fail: number | string;
  strict_pass_rate: number | string | null;
};

export type SectorResult = {
  sector: IndexSector;
  /** Systems that count for this sector. */
  cohortSize: number;
  /** True below the minimum cohort: nothing is computed or shown. */
  suppressed: boolean;
  aggregates: SectorAggregates | null;
};

export type SectorIndexPreview = {
  quarter: string;
  minCohort: number;
  sectors: SectorResult[];
  /** Systems that count, across sectors (published or not). */
  counted: number;
  /** Systems that cannot count, by reason (counts only). */
  excluded: Record<IndexExclusion, number>;
  /** Counted systems by source (counts only; never published). */
  sources: { customer: number; snapshot: number };
};

const toNumber = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? NaN : Number(value));

/** Linear interpolation between closest ranks (PostgreSQL's percentile_cont). */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) throw new Error("percentile of an empty cohort");
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

const wholePercent = (value: number) => Math.round(value * 100);

type Counted = { sector: IndexSector; source: "customer" | "snapshot"; scored: number; pass: number; partial: number; fail: number; rate: number };

function counted(row: SectorIndexInput): Counted | null {
  if (!row.eligible || !isIndexSector(row.sector)) return null;
  const scored = toNumber(row.n_scorable), pass = toNumber(row.n_pass), partial = toNumber(row.n_partial), fail = toNumber(row.n_fail);
  const rate = toNumber(row.strict_pass_rate);
  if (![scored, pass, partial, fail, rate].every(Number.isFinite) || scored < MIN_SCORED_PER_SYSTEM || rate < 0 || rate > 1) return null;
  if (pass + partial + fail !== scored) return null;
  return { sector: row.sector, source: row.source === "customer" ? "customer" : "snapshot", scored, pass, partial, fail, rate };
}

/** Aggregates one sector's systems; call only with a cohort of at least MIN_COHORT. */
export function sectorAggregates(systems: readonly Counted[]): SectorAggregates {
  if (systems.length < MIN_COHORT) throw new Error("cohort below the minimum");
  const rates = systems.map((item) => item.rate).sort((a, b) => a - b);
  const answers = systems.reduce((sum, item) => sum + item.scored, 0);
  const share = (part: number) => (answers ? wholePercent(part / answers) : 0);
  return {
    systems: systems.length,
    answers_scored: answers,
    median_pass: wholePercent(percentile(rates, 0.5)),
    p25_pass: wholePercent(percentile(rates, 0.25)),
    p75_pass: wholePercent(percentile(rates, 0.75)),
    correct_share: share(systems.reduce((sum, item) => sum + item.pass, 0)),
    partial_share: share(systems.reduce((sum, item) => sum + item.partial, 0)),
    incorrect_share: share(systems.reduce((sum, item) => sum + item.fail, 0)),
  };
}

/** The whole preview: every index sector with its cohort size, aggregates only where the cohort is large enough. */
export function aggregateSectorIndex(quarter: string, rows: readonly SectorIndexInput[]): SectorIndexPreview {
  const excluded: Record<IndexExclusion, number> = { no_sector: 0, incomplete: 0, weak_evidence: 0 };
  const sources = { customer: 0, snapshot: 0 };
  const bySector = new Map<IndexSector, Counted[]>();
  for (const row of rows) {
    const item = counted(row);
    if (!item) {
      const reason: IndexExclusion = row.exclusion === "incomplete" ? "incomplete" : !isIndexSector(row.sector) ? "no_sector" : "weak_evidence";
      excluded[reason] += 1;
      continue;
    }
    sources[item.source] += 1;
    bySector.set(item.sector, [...(bySector.get(item.sector) ?? []), item]);
  }
  const sectors = INDEX_SECTORS.map((sector): SectorResult => {
    const systems = bySector.get(sector) ?? [];
    const suppressed = systems.length < MIN_COHORT;
    return { sector, cohortSize: systems.length, suppressed, aggregates: suppressed ? null : sectorAggregates(systems) };
  });
  return { quarter, minCohort: MIN_COHORT, sectors, counted: sources.customer + sources.snapshot, excluded, sources };
}

/** Sectors that may be recorded as an edition (cohort at or above the minimum). */
export const publishableSectors = (preview: SectorIndexPreview) =>
  preview.sectors.filter((item): item is SectorResult & { aggregates: SectorAggregates } => !item.suppressed && item.aggregates !== null);
