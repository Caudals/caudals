/**
 * Sector packs and monthly new questions: ops command line (launch L-25).
 * Runs where the repository code and an evaluation database identity are
 * (the scheduler container in production, the disposable database in tests).
 * Pack files are read from standard input, so they need not be in the image.
 * Prints counts and id prefixes only: never question text or customer content.
 *
 *   validate                                   < pack.json
 *   import --actor <staff user id>              < pack.json
 *   refresh-start --org <id> --source <id> --actor <id>
 *   refresh-retry --org <id> --source <id> --actor <id>     (this month's failed reading, again)
 *   refresh-advance --org <id> --actor <id>
 *   proposals --org <id> --suite <id> --actor <id>
 *   reject-proposals --org <id> --suite <id> --actor <id>
 *
 * Pack writes need a platform-staff actor; proposal decisions need a workspace
 * owner, editor or operator, or platform staff (the database checks both).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { validatePackFile } from "../../lib/evals/sector-packs/schema";
import { importPackFile } from "../../lib/evals/sector-packs/store";
import { advanceSourceRefreshes, decideProposals, listProposals, retrySourceRefresh, startSourceRefresh } from "../../lib/evals/sector-packs/refresh";

async function stdinJson() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
function flag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}
const uuid = (name: string) => z.uuid().parse(flag(name));
const actor = () => z.string().min(3).max(255).parse(flag("actor"));
const short = (value: string) => value.slice(0, 8);

async function main() {
  const command = process.argv[2];
  if (command === "validate") {
    const { file, items, problems } = validatePackFile(await stdinJson());
    console.log(JSON.stringify({ pack: file.pack.id, sector: file.pack.sector, items: items.length, problems: problems.length, rights: Object.fromEntries([...new Set(items.map((item) => item.rights.kind))].map((kind) => [kind, items.filter((item) => item.rights.kind === kind).length])) }));
    for (const problem of problems.slice(0, 20)) console.log(JSON.stringify({ index: problem.index, key: problem.key, message: problem.message.slice(0, 160) }));
    process.exitCode = problems.length ? 2 : 0;
  } else if (command === "import") {
    const result = await importPackFile(actor(), await stdinJson());
    console.log(JSON.stringify({ ...result, versionId: short(result.versionId) }));
  } else if (command === "refresh-start") {
    const scope = { orgId: uuid("org"), actorId: actor() };
    console.log(JSON.stringify({ started: await startSourceRefresh(scope, uuid("source")) }));
  } else if (command === "refresh-retry") {
    const scope = { orgId: uuid("org"), actorId: actor() };
    console.log(JSON.stringify({ retried: await retrySourceRefresh(scope, uuid("source")) }));
  } else if (command === "refresh-advance") {
    console.log(JSON.stringify(await advanceSourceRefreshes({ orgId: uuid("org"), actorId: actor() })));
  } else if (command === "proposals") {
    const view = await listProposals({ orgId: uuid("org"), actorId: actor() }, uuid("suite"));
    console.log(JSON.stringify({
      monthlyQuestions: view.monthlyQuestions, proposals: view.proposals.length,
      kinds: Object.fromEntries(["new_page", "changed_page"].map((kind) => [kind, view.proposals.filter((item: { changeKind: string }) => item.changeKind === kind).length])),
      refreshes: view.refreshes.map((refresh: { id: string; period: string; status: string; pages: { new: number; changed: number }; proposalCount: number; reasonCode: string | null }) => ({ id: short(refresh.id), period: refresh.period, status: refresh.status, pages: refresh.pages, proposals: refresh.proposalCount, reason: refresh.reasonCode })),
    }));
  } else if (command === "reject-proposals") {
    const scope = { orgId: uuid("org"), actorId: actor() };
    const suite = uuid("suite");
    const view = await listProposals(scope, suite);
    const ids = view.proposals.map((item: { id: string }) => item.id);
    if (!ids.length) { console.log(JSON.stringify({ rejected: 0 })); return; }
    const result = await decideProposals(scope, suite, { approve: [], reject: ids }, `ops-reject-${randomUUID()}`);
    console.log(JSON.stringify({ rejected: result.rejected, added: result.added }));
  } else {
    console.error("usage: sector-packs.ts validate|import|refresh-start|refresh-retry|refresh-advance|proposals|reject-proposals [--org --source --suite --actor]");
    process.exitCode = 64;
  }
}

main()
  .catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "error";
    console.error(JSON.stringify({ event: "sector_packs_cli_failed", code, message: error instanceof Error ? error.message.slice(0, 300) : "unknown" }));
    process.exitCode = 1;
  })
  .finally(async () => { try { await getEvalsPool().end(); } catch { /* never opened */ } });
