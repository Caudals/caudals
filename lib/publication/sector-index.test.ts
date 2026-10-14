import { describe, expect, it } from "vitest";
import { inputsSql, markdown, recordSql } from "../../scripts/evals/sector-index";
import { MIN_COHORT, sectorAggregatesSchema } from "./contracts";
import { aggregateSectorIndex, percentile, publishableSectors, type SectorIndexInput } from "./sector-index";

/** One system as evals.sector_index_inputs returns it, plus fields a leak would carry. */
function system(sector: string | null, pass: number, partial: number, fail: number, extra: Record<string, unknown> = {}): SectorIndexInput {
  const scored = pass + partial + fail;
  return {
    sector, source: "snapshot", eligible: sector !== null && scored >= 5, exclusion: sector === null ? "no_sector" : scored < 5 ? "weak_evidence" : null,
    n_scorable: String(scored), n_pass: String(pass), n_partial: String(partial), n_fail: String(fail), strict_pass_rate: scored ? String(pass / scored) : null,
    ...extra,
  } as SectorIndexInput;
}

const cohort = (sector: string, size: number) =>
  Array.from({ length: size }, (_, index) => system(sector, 4 + (index % 5), 1, 5 - (index % 5), {
    company: `Aseguradora Ejemplo ${index}`, host: `chat${index}.ejemplo-seguros.es`, org_id: `00000000-0000-4000-8000-00000000000${index}`,
  }));

describe("anonymous sector index aggregation (launch L-31)", () => {
  it("suppresses a sector below ten systems and computes nothing for it", () => {
    const preview = aggregateSectorIndex("2026-Q4", cohort("insurance", MIN_COHORT - 1));
    const insurance = preview.sectors.find((item) => item.sector === "insurance")!;
    expect(insurance).toEqual({ sector: "insurance", cohortSize: 9, suppressed: true, aggregates: null });
    expect(publishableSectors(preview)).toEqual([]);
    expect(() => recordSql(preview, "au_founder", { ref: "Letter 2027-01-05", reviewer: "Counsel", signedOn: "2027-01-05" })).toThrow(/No sector has 10 systems/);
    // Every other sector is listed with a zero count, also suppressed.
    expect(preview.sectors.filter((item) => item.sector !== "insurance").every((item) => item.cohortSize === 0 && item.suppressed)).toBe(true);
  });

  it("publishes a sector of ten systems with medians, the middle half and pooled shares", () => {
    const preview = aggregateSectorIndex("2026-Q4", [...cohort("insurance", 10), ...cohort("energy", 3)]);
    const [insurance] = publishableSectors(preview);
    expect(insurance.sector).toBe("insurance");
    // Pass rates per system: 4/10, 5/10, 6/10, 7/10, 8/10, twice each.
    expect(insurance.aggregates).toEqual({
      systems: 10, answers_scored: 100, median_pass: 60, p25_pass: 50, p75_pass: 70, correct_share: 60, partial_share: 10, incorrect_share: 30,
    });
    expect(sectorAggregatesSchema.parse(insurance.aggregates)).toEqual(insurance.aggregates);
    expect(preview.sectors.find((item) => item.sector === "energy")).toMatchObject({ cohortSize: 3, suppressed: true, aggregates: null });
    expect(preview.counted).toBe(13);
  });

  it("never lets a name, host or id reach the preview, the markdown or the recorded SQL", () => {
    const preview = aggregateSectorIndex("2026-Q4", [...cohort("insurance", 12), ...cohort("legal", 4)]);
    const outputs = [JSON.stringify(preview), markdown(preview), recordSql(preview, "au_founder", { ref: "Signed review, ref. 2027/01", reviewer: "Counsel SLP", signedOn: "2027-01-05" })];
    for (const output of outputs) {
      expect(output).not.toMatch(/Aseguradora|ejemplo-seguros|chat\d|00000000-0000/);
    }
    // The recorded aggregates use only the fixed keys the database accepts.
    const recorded = /'(\{[^']+\})'::jsonb/.exec(outputs[2])![1];
    expect(Object.keys(JSON.parse(recorded)).sort()).toEqual(["answers_scored", "correct_share", "incorrect_share", "median_pass", "p25_pass", "p75_pass", "partial_share", "systems"]);
    expect(outputs[2]).toContain("evals.record_sector_index_publication('2026-Q4', 'insurance'");
    expect(outputs[2]).not.toContain("'legal'");
  });

  it("counts systems that cannot count by reason, and drops inconsistent rows", () => {
    const rows = [
      system(null, 6, 1, 3),
      system("insurance", 2, 0, 1),
      { ...system("insurance", 6, 1, 3), eligible: false, exclusion: "incomplete" },
      { ...system("insurance", 6, 1, 3), n_scorable: "11" },
      system("other", 6, 1, 3),
    ];
    const preview = aggregateSectorIndex("2026-Q4", rows);
    expect(preview.counted).toBe(0);
    expect(preview.excluded).toEqual({ no_sector: 2, incomplete: 1, weak_evidence: 2 });
  });

  it("interpolates percentiles like PostgreSQL's percentile_cont", () => {
    expect(percentile([0.1, 0.2, 0.3, 0.4], 0.5)).toBeCloseTo(0.25);
    expect(percentile([0.1, 0.2, 0.3, 0.4], 0.25)).toBeCloseTo(0.175);
    expect(percentile([0.5], 0.75)).toBe(0.5);
  });

  it("reads inputs in a read-only transaction and needs the lawyer's sign-off to record", () => {
    const sql = inputsSql("2026-Q4");
    expect(sql.split("\n")[0]).toBe("BEGIN READ ONLY;");
    expect(sql).toContain("evals.sector_index_inputs('2026-Q4')");
    expect(sql.trim().endsWith("ROLLBACK;")).toBe(true);
    const preview = aggregateSectorIndex("2026-Q4", cohort("insurance", 10));
    expect(() => recordSql(preview, "au_founder", { ref: "", reviewer: "Counsel", signedOn: "2027-01-05" })).toThrow(/legal/);
    expect(() => recordSql(preview, "", { ref: "Ref", reviewer: "Counsel", signedOn: "2027-01-05" })).toThrow(/actor/);
    expect(() => recordSql(preview, "au'; DROP", { ref: "Ref", reviewer: "Counsel", signedOn: "2027-01-05" })).toThrow(/actor/);
  });
});
