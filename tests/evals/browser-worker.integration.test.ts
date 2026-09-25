import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { websiteRecipeSchema } from "../../lib/evals/contracts/browser";
import { scenarioSchema } from "../../lib/evals/contracts/scenarios";
import { withTenant } from "../../lib/evals/repositories/db";
import { enqueueTargetExecution } from "../../lib/evals/queue/store";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { BrowserJobWorker } from "../../lib/evals/queue/browser-worker";

const ownerUrl = process.env.EVALS_TEST_DATABASE_URL;
const workerUrl = process.env.EVALS_DATABASE_URL;
const owner = ownerUrl ? new Pool({ connectionString: ownerUrl, max: 2 }) : undefined;
const workerPool = workerUrl ? new Pool({ connectionString: workerUrl, max: 4 }) : undefined;
afterAll(async () => { await owner?.end(); await workerPool?.end(); });

describe.skipIf(!ownerUrl || !workerUrl)("browser worker on PostgreSQL and a synthetic HTTPS widget", () => {
  it("keeps two turns in one context, resets the next attempt and settles two calls per attempt", async () => {
    const directory = mkdtempSync(join(tmpdir(), "evals-browser-worker-"));
    const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
    const server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(`<!doctype html><html><body><form><label>Question<textarea></textarea></label><button>Send</button></form>
        <div id="busy" hidden>Working</div><div role="log"></div><script>
        let turn=0;document.querySelector('form').onsubmit=(event)=>{event.preventDefault();
          const question=document.querySelector('textarea').value,busy=document.querySelector('#busy');
          busy.hidden=false;const row=document.createElement('p');row.className='assistant';
          document.querySelector('[role=log]').append(row);
          setTimeout(()=>{row.textContent='Answer '+(++turn)+': '+question;busy.hidden=true},200);
        };</script></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture_port_missing");
    const url = `https://127.0.0.1:${address.port}/`;
    const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
    const setup = await owner!.connect();
    try {
      const actor = `au_${randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`;
      const orgId = randomUUID(), projectId = randomUUID(), targetId = randomUUID();
      await setup.query("SELECT set_config('evals.actor_id',$1,false),set_config('evals.org_id',$2,false)", [actor, orgId]);
      const targetRevisionId = randomUUID(), recipeId = randomUUID(), evaluationId = randomUUID();
      const rubricId = randomUUID(), caseId = randomUUID(), caseRevisionId = randomUUID();
      const suiteId = randomUUID(), suiteVersionId = randomUUID();
      const config = { schema_version: "1.0", target_revision_id: targetRevisionId,
        limits: { max_turns: 2, max_output_tokens: 100, max_tool_calls: 0, timeout_ms: 8000, repetitions: 1 },
        requests_per_minute: 10, concurrent_sessions: 1, reset: "fresh_session", kind: "website",
        endpoint: url, recipe_revision_id: recipeId, login_session_id: null };
      const recipe = websiteRecipeSchema.parse(withContentHash({ schema_version: "1.0", recipe_revision_id: recipeId,
        source: "operator_authored", start_url: url, launcher: null, frame_chain: [],
        input: { kind: "role", role: "textbox", name: "Question" },
        submit: { kind: "click", locator: { kind: "role", role: "button", name: "Send" } },
        message_container: { kind: "role", role: "log", name: null },
        assistant_message: { kind: "css", value: ".assistant" },
        completion: { kind: "selector_hidden", locator: { kind: "css", value: "#busy" } },
        reset: { kind: "new_context" }, assistant_extraction: "last_new_message",
        created_at: new Date().toISOString(), extensions: {} }));
      await setup.query(`INSERT INTO auth_user(id,name,email,"emailVerified","createdAt","updatedAt")
        VALUES($1,'Browser fixture',$2,true,now(),now())`, [actor, `${randomUUID()}@example.test`]);
      await setup.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Browser fixture',$2)", [orgId, actor]);
      await setup.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, actor]);
      await setup.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Fixture')", [projectId, orgId]);
      await setup.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Fixture widget')", [targetId, orgId, projectId]);
      await setup.query(`INSERT INTO evals.website_recipe_revision(id,org_id,project_id,target_id,content_hash,document,probe_evidence)
        VALUES($1,$2,$3,$4,$5,$6,'{}')`, [recipeId, orgId, projectId, targetId, recipe.content_hash, recipe]);
      await setup.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
        [targetRevisionId, orgId, targetId, "a".repeat(64), config]);
      await setup.query(`INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency)
        VALUES($1,$2,$3,'Fixture','source_grounded',1,'EUR')`, [evaluationId, orgId, projectId]);
      await setup.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,'{}')",
        [rubricId, orgId, projectId, "b".repeat(64)]);
      await setup.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [caseId, orgId, projectId]);
      await setup.query(`INSERT INTO evals.case_revision(id,org_id,case_id,rubric_revision_id,family_id,split,content_hash,document)
        VALUES($1,$2,$3,$4,'family','validation',$5,'{}')`, [caseRevisionId, orgId, caseId, rubricId, "c".repeat(64)]);
      await setup.query("INSERT INTO evals.suite(id,org_id,project_id,title) VALUES($1,$2,$3,'Fixture')", [suiteId, orgId, projectId]);
      const manifest = { suite_id: suiteId, suite_version_id: suiteVersionId, content_hash: "d".repeat(64),
        case_revisions: [{ case_id: caseId, revision_id: caseRevisionId, content_hash: "c".repeat(64), family_id: "family", split: "validation" }],
        source_revisions: [], rubric_revisions: [{ revision_id: rubricId, content_hash: "b".repeat(64) }],
        fixture_revisions: [], output_schema_revisions: [], files: [] };
      await setup.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)",
        [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
      await setup.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,0)",
        [orgId, suiteVersionId, caseRevisionId]);

      const tenant = { orgId, actorId: actor };
      const tx: TenantTransaction = (scope, fn) => withTenant(scope, fn, workerPool!);
      const targetWorker = new BrowserJobWorker({ tx, keys: new Map(), actorId: actor,
        workerId: randomUUID(), browser, destinationCheck: async (candidate) => {
          if (new URL(candidate).origin !== new URL(url).origin) throw new Error("fixture_destination_denied");
        } });
      const candidateInput = { schema_version: "1.0" as const, case_id: caseId, case_revision_id: caseRevisionId,
        messages: [{ role: "user" as const, content: "first turn" }], attachments: [], tools: [] };
      const scenario = scenarioSchema.parse({ mode: "conversation" as const, required_capabilities: ["multi_turn" as const],
        messages: candidateInput.messages, attachments: [], termination: { kind: "final_answer" as const },
        tool_fixture_set_id: null, turn_plan: { entry_node_id: "correction", nodes: [{ id: "correction",
          message: { role: "user" as const, content: "second turn" }, max_visits: 1,
          branches: [{ condition: { kind: "always" as const }, next_node_id: null }] }] } });
      const runOnce = async (selectedScenario = scenario, expectedStatus = "succeeded") => {
        const runId = randomUUID(), unitId = randomUUID(), workflowId = randomUUID();
        await setup.query(`INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode)
          VALUES($1,$2,$3,$4,$5,'deployed_system')`, [runId, orgId, evaluationId, targetRevisionId, suiteVersionId]);
        await setup.query(`INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status)
          VALUES($1,$2,$3,$4,0,'queued')`, [unitId, orgId, runId, caseRevisionId]);
        const stepId = await tx(tenant, (client) => enqueueTargetExecution(client, tenant, { workflowId, runId,
          planHash: "e".repeat(64), version: 1, queue: "execute_browser",
          input: { kind: "target_execution", runId, caseUnitId: unitId, caseRevisionId, targetRevisionId,
            repetition: 0, candidateInput, scenario: selectedScenario, toolFixture: null, timeoutMs: 8000,
            destinationPolicyId: "browser-public-https-v1" } }));
        const inputHash = await tx(tenant, async (client) => (await client.query(
          "SELECT input_hash FROM evals.workflow_step WHERE id=$1", [stepId])).rows[0].input_hash);
        await targetWorker.handle({ orgId, stepId, inputHash });
        const result = await tx(tenant, async (client) => ({
          unit: (await client.query("SELECT status,reason_code FROM evals.case_unit WHERE id=$1", [unitId])).rows[0],
          observation: (await client.query("SELECT document FROM evals.observation WHERE case_unit_id=$1", [unitId])).rows[0]?.document,
          calls: (await client.query(`SELECT c.turn_ordinal,c.state FROM evals.target_invocation_call c
            JOIN evals.target_invocation_ledger l ON (l.org_id,l.attempt_id)=(c.org_id,c.attempt_id)
            WHERE l.run_id=$1 ORDER BY c.turn_ordinal`, [runId])).rows,
        }));
        expect(result.unit.status).toBe(expectedStatus);
        expect(result.calls).toEqual([{ turn_ordinal: 1, state: "recorded" }, { turn_ordinal: 2, state: "recorded" }]);
        expect(browser.contexts()).toHaveLength(0);
        return expectedStatus === "succeeded" ? result.observation.messages.at(-1).content as string : result.unit.reason_code as string;
      };
      expect(await runOnce()).toBe("Answer 2: second turn");
      expect(await runOnce()).toBe("Answer 2: second turn");
      const exhausted = scenarioSchema.parse({ ...scenario, turn_plan: { ...scenario.turn_plan,
        nodes: [{ ...scenario.turn_plan!.nodes[0], branches: [{ condition: { kind: "always" }, next_node_id: "correction" }] }] } });
      expect(await runOnce(exhausted, "capture_incomplete")).toBe("turn_budget_exhausted");
    } finally {
      setup.release();
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
