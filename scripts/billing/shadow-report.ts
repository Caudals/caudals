/**
 * Shadow-week diff report (launch spec v2 §6.18; package L-11).
 *
 * With BILLING_CREDITS_ENABLED=true and BILLING_ENFORCE=shadow, the engine
 * records what it would hold, capture, release and charge in
 * billing.shadow_entry. billing.shadow_diff(day, org) compares one UTC day of
 * it with budget_reservation, the recorded attempts, units and usage; the
 * scheduler keeps a copy each day in billing.shadow_report (04:00 UTC, for
 * the previous day). This script prints the same diff on demand:
 *
 *   npx tsx scripts/billing/shadow-report.ts --sql [--day 2026-10-12] [--org <workspace uuid>] \
 *     | sudo docker exec -i <caudals-postgres container> psql -U postgres -d caudals -X -q -At > shadow.json
 *   npx tsx scripts/billing/shadow-report.ts --input shadow.json [--json]
 *
 * The SQL runs in a READ ONLY transaction and returns counts, µcr sums and
 * workspace ids only. Every check must be 0 before enforcement.
 */
import { readFileSync } from "node:fs";
import { ucrToCredits } from "../../lib/billing/units";

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

function sql(day: string, org: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("day must be YYYY-MM-DD");
  if (org !== null && !/^[0-9a-f-]{36}$/.test(org)) throw new Error("org must be a workspace uuid");
  return [
    "BEGIN READ ONLY;",
    "SELECT set_config('evals.actor_id','system:shadow-report-script',true) \\g /dev/null",
    `SELECT billing.shadow_diff('${day}'::date,${org ? `'${org}'::uuid` : "NULL"});`,
    "ROLLBACK;",
  ].join("\n");
}

type Report = {
  day: string; org_id: string | null; mismatches: number;
  totals: Record<string, number>; meters: Record<string, { count: number; quantity: number; ucr: number }>;
  euro: Record<string, number | string>; checks: Record<string, number>;
  accounts: Array<Record<string, number | string | null>>;
};
const credits = (ucr: number | string) => ucrToCredits(BigInt(String(ucr)));

function markdown(report: Report) {
  const t = report.totals;
  const lines = [
    `# Shadow credit report · ${report.day}${report.org_id ? ` · workspace ${report.org_id}` : ""}`,
    "",
    report.mismatches === 0 ? "All checks pass: shadow charges match the recorded work." : `**${report.mismatches} mismatches.** Do not enforce until they are explained (runbook 17).`,
    "",
    "## What enforce mode would have done",
    "",
    "| | Count | Credits |",
    "| --- | ---: | ---: |",
    `| Admissions (p90 required) | ${t.admissions} (${t.admissions_blocked} short) | ${credits(t.admission_ucr)} |`,
    `| Holds | ${t.holds} (${t.holds_blocked} short) | ${credits(t.held_ucr)} |`,
    `| Captures (requested ${credits(t.capture_requested_ucr)}, ${t.captures_over_hold} capped) | ${t.captures} | ${credits(t.captured_ucr)} |`,
    `| Releases (${t.releases_expired} after 24 h) | ${t.releases} | ${credits(t.released_ucr)} |`,
    `| Platform meters | ${t.actions} (${t.actions_blocked} short) | ${credits(t.action_ucr)} |`,
    `| Run refunds | ${t.refunds} | ${credits(t.refund_ucr)} |`,
    `| **Charged** | | **${credits(t.charged_ucr)}** |`,
    "",
    "## Meters",
    "",
    "| Meter | Count | Quantity | Credits |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(report.meters).map(([meter, value]) => `| ${meter} | ${value.count} | ${value.quantity} | ${credits(value.ucr)} |`),
    "",
    "## Our euro side for the same calls",
    "",
    `Attempts ${report.euro.attempts}: reserved €${report.euro.reserved_eur}, settled €${report.euro.settled_eur}, released ${report.euro.released}, unresolved ${report.euro.unresolved}, missing ${report.euro.missing}.`,
    "",
    "## Checks (all must be 0)",
    "",
    "| Check | Result |",
    "| --- | ---: |",
    ...Object.entries(report.checks).map(([name, value]) => `| ${name.replaceAll("_", " ")} | ${value === 0 ? "0 (ok)" : `${value} (MISMATCH)`} |`),
    "",
    "## Workspaces",
    "",
    "| Workspace | Mode | Entries | Held | Captured | Released | Meters | Refunds | Would block |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.accounts.map(row => `| ${row.org_id} | ${row.billing_mode} | ${row.entries} | ${credits(row.held_ucr as number)} | ${credits(row.captured_ucr as number)} | ${credits(row.released_ucr as number)} | ${credits(row.action_ucr as number)} | ${credits(row.refund_ucr as number)} | ${row.would_block} |`),
  ];
  return lines.join("\n");
}

if (args.includes("--sql")) {
  const day = flag("--day") ?? new Date().toISOString().slice(0, 10);
  process.stdout.write(sql(day, flag("--org") ?? null) + "\n");
} else if (flag("--input")) {
  const text = readFileSync(flag("--input")!, "utf8").split("\n").map(line => line.trim()).find(line => line.startsWith("{"));
  if (!text) throw new Error("No report in the input: run the --sql output through psql -At first.");
  const report = JSON.parse(text) as Report;
  process.stdout.write((args.includes("--json") ? JSON.stringify(report, null, 2) : markdown(report)) + "\n");
  process.exitCode = report.mismatches === 0 ? 0 : 2;
} else {
  process.stderr.write("usage: shadow-report.ts --sql [--day YYYY-MM-DD] [--org <uuid>] | psql …  ·  shadow-report.ts --input file [--json]\n");
  process.exitCode = 1;
}
