/**
 * The anonymous sector index (launch L-31; spec v2 P-53, D-16): aggregation
 * by hand, for the founder. Nothing here publishes on its own, and the public
 * page shows an edition only while PUBLIC_RESULTS_ENABLED=true.
 *
 * Inputs are only our own public snapshots with an assigned sector and the
 * results of customers who consented in writing (evals.sector_index_inputs,
 * migration 104). The rows carry no identifier: no company, host, workspace,
 * report or date. A sector with fewer than 10 systems is suppressed.
 *
 *   # 1. Read the quarter's inputs (READ ONLY; acts as a platform administrator)
 *   npx tsx scripts/evals/sector-index.ts --sql --quarter 2026-Q4 [--actor <admin user id>] \
 *     | sudo docker exec -i <caudals-postgres container> psql -U postgres -d caudals -X -q -At > inputs.json
 *   # 2. Preview: cohort sizes per sector (counts only), suppression, aggregates
 *   npx tsx scripts/evals/sector-index.ts --input inputs.json --quarter 2026-Q4 [--json]
 *   # 3. After the lawyer's sign-off, record the publishable sectors (writes)
 *   npx tsx scripts/evals/sector-index.ts --record-sql --input inputs.json --quarter 2026-Q4 --actor <admin user id> \
 *     --legal-ref "<where the signed review is kept>" --legal-reviewer "<firm or lawyer>" --legal-signed-on YYYY-MM-DD \
 *     | sudo docker exec -i <caudals-postgres container> psql -U postgres -d caudals -X -q -At -v ON_ERROR_STOP=1
 *
 * The database recounts every cohort when recording, refuses under 10
 * systems, an unended quarter or a missing sign-off, and keeps the edition
 * as an immutable record (withdraw with evals.withdraw_sector_index_publication).
 */
import { readFileSync } from "node:fs";
import { INDEX_METHODOLOGY_VERSION, QUARTER_PATTERN } from "../../lib/publication/contracts";
import { aggregateSectorIndex, publishableSectors, type SectorIndexInput, type SectorIndexPreview } from "../../lib/publication/sector-index";

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const ACTOR = /^[A-Za-z0-9_-]{1,255}$/;

function quarterArg(): string {
  const quarter = (flag("--quarter") ?? "").toUpperCase();
  if (!QUARTER_PATTERN.test(quarter)) throw new Error("--quarter must look like 2026-Q4");
  return quarter;
}

/** Acts as the given platform administrator, or the earliest one for a read. */
function actorSql(actor: string | undefined, required: boolean) {
  if (actor) {
    if (!ACTOR.test(actor)) throw new Error("--actor must be a user id");
    return `SELECT set_config('evals.actor_id',${literal(actor)},true) \\g /dev/null`;
  }
  if (required) throw new Error("--actor <platform admin user id> is required to record an edition");
  return "SELECT set_config('evals.actor_id',(SELECT user_id FROM evals.platform_role WHERE role='platform_admin' ORDER BY created_at, user_id LIMIT 1),true) \\g /dev/null";
}

export function inputsSql(quarter: string, actor?: string) {
  return [
    "BEGIN READ ONLY;",
    actorSql(actor, false),
    `SELECT coalesce(json_agg(row_to_json(i)), '[]'::json) FROM evals.sector_index_inputs(${literal(quarter)}) i;`,
    "ROLLBACK;",
  ].join("\n");
}

export function recordSql(preview: SectorIndexPreview, actor: string, legal: { ref: string; reviewer: string; signedOn: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(legal.signedOn)) throw new Error("--legal-signed-on must be YYYY-MM-DD");
  if (legal.ref.trim().length < 3 || legal.reviewer.trim().length < 2) throw new Error("--legal-ref and --legal-reviewer are required");
  const sectors = publishableSectors(preview);
  if (!sectors.length) throw new Error(`No sector has ${preview.minCohort} systems in ${preview.quarter}: nothing to record.`);
  return [
    "BEGIN;",
    actorSql(actor, true),
    ...sectors.map((item) => `SELECT id, quarter, sector, cohort_size FROM evals.record_sector_index_publication(${literal(preview.quarter)}, ${literal(item.sector)}, ${literal(JSON.stringify(item.aggregates))}::jsonb, ${literal(INDEX_METHODOLOGY_VERSION)}, ${literal(legal.ref.trim())}, ${literal(legal.reviewer.trim())}, ${literal(legal.signedOn)}::date);`),
    "COMMIT;",
  ].join("\n");
}

function readInputs(path: string): SectorIndexInput[] {
  const text = readFileSync(path, "utf8").split("\n").map((line) => line.trim()).find((line) => line.startsWith("["));
  if (!text) throw new Error("No inputs in the file: run the --sql output through psql -At first.");
  return JSON.parse(text) as SectorIndexInput[];
}

export function markdown(preview: SectorIndexPreview) {
  return [
    `# Anonymous sector index · ${preview.quarter} (preview, nothing published)`,
    "",
    `Minimum cohort: ${preview.minCohort} systems per sector. Systems that count: ${preview.counted} (customers ${preview.sources.customer}, snapshots ${preview.sources.snapshot}).`,
    `Cannot count: ${preview.excluded.no_sector} without a sector, ${preview.excluded.incomplete} incomplete, ${preview.excluded.weak_evidence} with too few scored answers.`,
    "",
    "| Sector | Systems | Status | Median | Middle half | Answers | Correct · partly · incorrect |",
    "| --- | ---: | --- | ---: | --- | ---: | --- |",
    ...preview.sectors.map((item) => item.aggregates
      ? `| ${item.sector} | ${item.cohortSize} | publishable | ${item.aggregates.median_pass}% | ${item.aggregates.p25_pass}–${item.aggregates.p75_pass}% | ${item.aggregates.answers_scored} | ${item.aggregates.correct_share} · ${item.aggregates.partial_share} · ${item.aggregates.incorrect_share}% |`
      : `| ${item.sector} | ${item.cohortSize} | suppressed (under ${preview.minCohort}) | — | — | — | — |`),
  ].join("\n");
}

function main() {
  if (args.includes("--sql")) {
    process.stdout.write(inputsSql(quarterArg(), flag("--actor")) + "\n");
  } else if (args.includes("--record-sql")) {
    const preview = aggregateSectorIndex(quarterArg(), readInputs(flag("--input") ?? ""));
    process.stdout.write(recordSql(preview, flag("--actor") ?? "", { ref: flag("--legal-ref") ?? "", reviewer: flag("--legal-reviewer") ?? "", signedOn: flag("--legal-signed-on") ?? "" }) + "\n");
  } else if (flag("--input")) {
    const preview = aggregateSectorIndex(quarterArg(), readInputs(flag("--input")!));
    process.stdout.write((args.includes("--json") ? JSON.stringify(preview, null, 2) : markdown(preview)) + "\n");
  } else {
    process.stderr.write("usage: sector-index.ts --sql --quarter 2026-Q4 [--actor id] | psql …  ·  --input file --quarter 2026-Q4 [--json]  ·  --record-sql --input file --quarter … --actor id --legal-ref … --legal-reviewer … --legal-signed-on YYYY-MM-DD\n");
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("sector-index.ts")) main();
