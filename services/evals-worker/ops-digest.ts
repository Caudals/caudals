/**
 * Manual run of the weekly ops digest (launch L-21), inside the scheduler
 * container so it uses the scheduler's database identity and secrets:
 *
 *   node --conditions=react-server --import tsx services/evals-worker/ops-digest.ts --dry-run
 *   node --conditions=react-server --import tsx services/evals-worker/ops-digest.ts --force
 *
 * --dry-run reads this week's aggregates and prints counts only (no names, no
 * address, nothing sent). --force sends the week's digest now to the internal
 * address; it claims the week like the Monday job, so it never sends twice.
 */
import { z } from "zod";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { composeDigest, digestLocale, digestRecipient, digestSender, digestSummary, digestWeek, runOpsDigest } from "../../lib/evals/operations/ops-digest";
import { targetStage, type OpsDigestData } from "../../lib/analytics/targets";

async function main() {
  const actorId = z.string().min(1).parse(process.env.EVALS_SCHEDULER_ACTOR_ID);
  const mode = z.enum(["--dry-run", "--force"]).parse(process.argv[2]);
  try {
    if (mode === "--dry-run") {
      const week = digestWeek(new Date());
      const data = await withTenant({ orgId: "", actorId }, async (db) =>
        (await db.query("SELECT evals.ops_digest_data($1,$2) AS data", [week.from, week.to])).rows[0].data as OpsDigestData);
      const message = composeDigest(data, { locale: digestLocale(), stage: targetStage() });
      console.info(JSON.stringify({ event: "ops_digest_dry_run", week: week.weekStart, lines: message.text.split("\n").length, ...digestSummary(data) }));
      return;
    }
    const outcome = await runOpsDigest({ actorId, send: await digestSender(), to: await digestRecipient(), force: true, locale: digestLocale(), appUrl: process.env.EVALS_APP_URL });
    console.info(JSON.stringify({ event: `ops_digest_${outcome.status}`, week: outcome.week, reason: outcome.reason, ...outcome.summary }));
    if (outcome.status === "failed") process.exitCode = 1;
  } finally {
    await getEvalsPool().end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  console.error(JSON.stringify({ event: "ops_digest_command_failed", reason: /^[a-z_]{3,64}$/.test(message) ? message : "unknown" }));
  process.exitCode = 1;
});
