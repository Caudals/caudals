/**
 * Opt-in public results pages (launch L-31; spec v2 P-23): the founder's
 * manual steps. Each command prints SQL to run through psql as a platform
 * administrator; the SECURITY DEFINER functions of migration 104 check the
 * role, the standing consent and the evidence, and write the audit trail.
 * Nothing is public until PUBLIC_RESULTS_ENABLED=true.
 *
 *   PSQL="sudo docker exec -i <caudals-postgres container> psql -U postgres -d caudals -X -q -At -v ON_ERROR_STOP=1"
 *
 *   # Consents waiting for review (READ ONLY)
 *   npx tsx scripts/evals/public-results.ts list | $PSQL
 *   # What a page would show, without publishing (the publish call rolled back)
 *   npx tsx scripts/evals/public-results.ts preview --consent <id> --actor <admin user id> | $PSQL
 *   # Publish after the manual pre-publication review
 *   npx tsx scripts/evals/public-results.ts publish --consent <id> --slug <slug> --review-note "<what you checked>" --actor <admin user id> | $PSQL
 *   # Take a page down (an owner withdraws in the app; this is Caudals' own withdrawal)
 *   npx tsx scripts/evals/public-results.ts unpublish --page <id> --reason "<why>" --actor <admin user id> | $PSQL
 *   # Withdraw a consent an owner asked to withdraw by email (also takes the page down)
 *   npx tsx scripts/evals/public-results.ts revoke --org <workspace id> --consent <id> --reason "<why>" --actor <admin user id> | $PSQL
 *   # Record a consent signed outside the app (paper or e-mail), with where the signed copy is kept
 *   npx tsx scripts/evals/public-results.ts record-signed --org <workspace id> --revision <report revision id> \
 *     [--results-page --public-name "…" --scope "…"] [--sector-index --sector insurance] \
 *     --signer-name "…" --signer-role "…" --document-ref "…" --signed-at YYYY-MM-DD --locale es --actor <admin user id> | $PSQL
 *   # Assign one of our own snapshots to an index sector (or `none`)
 *   npx tsx scripts/evals/public-results.ts snapshot-sector --snapshot <id> --sector insurance --actor <admin user id> | $PSQL
 */
import { randomUUID } from "node:crypto";
import { CONSENT_VERSION, INDEX_SECTORS, isIndexSector, isResultSlug } from "../../lib/publication/contracts";

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(name: string) {
  const value = flag(name) ?? "";
  if (!UUID.test(value)) throw new Error(`${name} must be a uuid`);
  return literal(value);
}
function text(name: string, min = 3, max = 1000) {
  const value = (flag(name) ?? "").trim();
  if (value.length < min || value.length > max) throw new Error(`${name} is required (${min}–${max} characters)`);
  return literal(value);
}
function actor() {
  const value = flag("--actor") ?? "";
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(value)) throw new Error("--actor <platform admin user id> is required");
  return `SELECT set_config('evals.actor_id',${literal(value)},true) \\g /dev/null`;
}
const tenant = (org: string) => `SELECT set_config('evals.org_id',${org},true) \\g /dev/null`;

export function commandSql(command: string): string {
  switch (command) {
    case "list":
      return [
        "BEGIN READ ONLY;",
        `SELECT c.id AS consent, c.org_id AS workspace, c.report_revision_id AS revision, c.results_page, c.sector_index, c.index_sector,
                c.method, to_char(c.signed_at,'YYYY-MM-DD') AS signed, c.revoked_at IS NOT NULL AS revoked,
                p.id AS page, p.slug, p.published_at IS NOT NULL AND p.unpublished_at IS NULL AS live
           FROM evals.publication_consent c LEFT JOIN evals.public_result_page p ON p.consent_id = c.id
          ORDER BY c.recorded_at DESC;`,
        "ROLLBACK;",
      ].join("\n");
    case "preview":
    case "publish": {
      const slug = command === "preview" ? `preview-${randomUUID().slice(0, 8)}` : (flag("--slug") ?? "");
      if (!isResultSlug(slug)) throw new Error("--slug must be 3–80 lowercase letters, digits and single hyphens");
      const note = command === "preview" ? literal("Preview only; rolled back.") : text("--review-note", 10, 1000);
      return [
        "BEGIN;",
        actor(),
        `SELECT id, slug, projection FROM evals.publish_result_page(${uuid("--consent")}, ${literal(slug)}, ${note});`,
        command === "preview" ? "ROLLBACK;" : "COMMIT;",
      ].join("\n");
    }
    case "unpublish":
      return ["BEGIN;", actor(), `SELECT id, slug, unpublished_at FROM evals.unpublish_result_page(${uuid("--page")}, ${text("--reason", 3, 500)});`, "COMMIT;"].join("\n");
    case "revoke": {
      const org = uuid("--org");
      return ["BEGIN;", actor(), tenant(org), `SELECT id, revoked_at FROM evals.revoke_publication_consent(${org}, ${uuid("--consent")}, ${text("--reason", 1, 500)});`, "COMMIT;"].join("\n");
    }
    case "record-signed": {
      const org = uuid("--org");
      const resultsPage = args.includes("--results-page"), sectorIndex = args.includes("--sector-index");
      if (!resultsPage && !sectorIndex) throw new Error("Choose --results-page and/or --sector-index");
      const sector = flag("--sector");
      if (sectorIndex && !isIndexSector(sector)) throw new Error(`--sector must be one of ${INDEX_SECTORS.join(", ")}`);
      const signedAt = flag("--signed-at") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(signedAt)) throw new Error("--signed-at must be YYYY-MM-DD");
      const locale = flag("--locale") ?? "es";
      if (!["en", "es"].includes(locale)) throw new Error("--locale must be en or es");
      return [
        "BEGIN;",
        actor(),
        tenant(org),
        `SELECT id FROM evals.record_publication_consent(${org}, ${uuid("--revision")}, ${resultsPage}, ${sectorIndex},
          ${resultsPage ? text("--public-name", 2, 120) : "NULL"}, ${resultsPage ? text("--scope", 10, 400) : "NULL"}, ${sectorIndex ? literal(sector!) : "NULL"},
          ${text("--signer-name", 2, 120)}, ${text("--signer-role", 2, 120)}, ${literal(CONSENT_VERSION)}, ${literal(locale)},
          ${literal(`signed-${randomUUID()}`)}, 'signed_document', ${text("--document-ref", 3, 300)}, ${literal(signedAt)}::date::timestamptz);`,
        "COMMIT;",
      ].join("\n");
    }
    case "snapshot-sector": {
      const sector = flag("--sector");
      if (sector !== "none" && !isIndexSector(sector)) throw new Error(`--sector must be none or one of ${INDEX_SECTORS.join(", ")}`);
      return ["BEGIN;", actor(), `SELECT snapshot_id, sector FROM evals.set_snapshot_index_sector(${uuid("--snapshot")}, ${sector === "none" ? "NULL" : literal(sector!)});`, "COMMIT;"].join("\n");
    }
    default:
      throw new Error("usage: public-results.ts list | preview | publish | unpublish | revoke | record-signed | snapshot-sector (see the header)");
  }
}

if (process.argv[1]?.endsWith("public-results.ts")) {
  try {
    process.stdout.write(commandSql(args[0] ?? "") + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
