import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { digest } from "../../lib/evals/queue/store";
import { sha256 } from "../../lib/evals/contracts/hashing";
import { advanceAutomaticGeneration, advancePendingGenerations, startAutomaticGeneration } from "../../lib/evals/repositories/automatic-generation";
import { createWebsitePreview, decideContextConfirmation, getContextConfirmation, getWebsitePreview, importWebsitePreview } from "../../lib/evals/repositories/intake";
import { createUpload, getSource } from "../../lib/evals/repositories/evidence";
import { createReportForRun, scoreRun } from "../../lib/evals/repositories/managed";
import { CONTEXT_EXTENSION, CONTEXT_NOT_CONFIRMED } from "../../lib/evals/intake/context";
import { createPrefixedId } from "../../lib/operator/ids";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

/** What the worker writes when a model step finishes. */
async function completeStep(db: PoolClient, orgId: string, stepId: string, providerId: string, priceId: string, body: unknown) {
  const attemptId = randomUUID();
  await db.query("INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,0,1,$4,$5,'completed',100)", [attemptId, orgId, stepId, providerId, priceId]);
  const output = { text: JSON.stringify(body), complete: true };
  await db.query("INSERT INTO evals.execution_result(org_id,step_id,attempt_id,output,output_hash) VALUES($1,$2,$3,$4,$5)", [orgId, stepId, attemptId, output, digest(output)]);
  await db.query("UPDATE evals.workflow_step SET status='completed' WHERE org_id=$1 AND id=$2", [orgId, stepId]);
}

(ownerUrl && runtimeUrl ? describe : describe.skip)("better document intake on PostgreSQL (launch L-34)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  async function fixture() {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID();
    const accountId = randomUUID(), providerId = randomUUID(), priceId = randomUUID();
    const { source } = syntheticAccountingFixture(actorId);
    const anchor = source.anchors[0];
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Intake fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Intake fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title,description) VALUES($1,$2,'Intake fixture','Fee questions')", [projectId, orgId]);
      await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready',now()+interval '1 day')",
        [artifactId, orgId, projectId, source.artifact.path, "test/" + artifactId, source.artifact.sha256, source.artifact.size_bytes, source.artifact.media_type]);
      await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,'caudals_owned')", [source.source_id, orgId, projectId, source.title]);
      await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'utf8-text-v1')",
        [source.revision_id, orgId, source.source_id, artifactId, source.content_hash, source]);
      const [, start, end] = anchor.locator.split(":");
      await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,0,$4,$5)", [anchor.id, orgId, source.revision_id, anchor.excerpt, { start: Number(start), end: Number(end) }]);
      await db.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'intake fixture','EUR',100,true)", [accountId]);
      await db.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
        VALUES($1,$2,'dgx','http://dgx.invalid/v1','fixture-generator','fixture',ARRAY['context_analyzer','generator','judge'],'{"text":true,"boundedTokens":true,"jsonObject":true}',32768,8192,ARRAY['synthetic'],ARRAY['private'],1000,10000000,4)`, [providerId, accountId]);
      await db.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [priceId, providerId]);
      for (const role of ["context_analyzer", "generator"])
        await db.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,$2,$3,$4,'synthetic','private',0.0001,$5)", [orgId, role, providerId, priceId, actorId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const evaluation = async () => {
      const id = randomUUID();
      await owner.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Intake fixture','source_grounded',5,'EUR')", [id, orgId, projectId]);
      return id;
    };
    const cite = (quote: string) => [{ sourceRevisionId: source.revision_id, anchorId: anchor.id, quote }];
    const profileOutput = {
      purpose: { value: "Explain policy A fees", confidence: 0.9, citations: cite("add a 10% service fee to the subtotal") },
      intendedUsers: { values: ["Accountants"], confidence: 0.4, citations: cite("Synthetic policy A") },
      tasks: { values: ["Fees"], confidence: 0.8, citations: cite("service fee") },
      languages: { values: ["en"], confidence: 0.9, citations: cite("round once to two decimals") },
      jurisdiction: { value: null, confidence: 0, citations: [] }, asOf: { value: null, confidence: 0, citations: [] },
      businessBoundaries: { values: ["Never round more than once"], confidence: 0.6, citations: cite("round once") },
      supportedCapabilities: { values: [], confidence: 0, citations: [] }, materialRisks: { values: [], confidence: 0, citations: [] },
      allowedActions: { values: [], confidence: 0, citations: [] }, tools: { values: [], confidence: 0, citations: [] }, criticalQuestions: [],
    };
    const draftOutput = { cases: [
      { question: "What service fee does policy A add to the subtotal?", expected: "Policy A adds a 10% service fee.", keyFacts: ["10% service fee"], sourceRevisionId: source.revision_id, anchorId: anchor.id, supportingQuote: anchor.excerpt, severity: "high", difficulty: "routine" },
      { question: "How many times is the total rounded under policy A?", expected: "It is rounded once, to two decimals.", keyFacts: ["round once to two decimals"], sourceRevisionId: source.revision_id, anchorId: anchor.id, supportingQuote: anchor.excerpt, severity: "medium", difficulty: "advanced" },
    ] };
    /** The worker finishing the latest step of a kind, then marking the job ready for the next advance. */
    const finish = async (jobId: string, kind: "profile" | "generate", body: unknown) => {
      const db2 = await owner.connect();
      try {
        await db2.query("BEGIN");
        await db2.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
        const step = (await db2.query("SELECT s.id FROM evals.workflow_step s JOIN evals.generation_job g ON g.org_id=s.org_id AND g.workflow_id=s.workflow_id WHERE g.org_id=$1 AND g.id=$2 AND s.step_kind=$3 ORDER BY s.version DESC LIMIT 1", [orgId, jobId, kind])).rows[0];
        await completeStep(db2, orgId, step.id, providerId, priceId, body);
        await db2.query("UPDATE evals.generation_job SET status=$3,updated_at=now()-interval '1 minute' WHERE org_id=$1 AND id=$2", [orgId, jobId, kind === "profile" ? "profile_ready" : "draft_ready"]);
        await db2.query("COMMIT");
      } catch (error) { await db2.query("ROLLBACK"); throw error; } finally { db2.release(); }
    };
    return { actorId, orgId, projectId, providerId, priceId, source, anchor, evaluation, profileOutput, draftOutput, finish, scope: { orgId, actorId } };
  }

  const start = (f: Awaited<ReturnType<typeof fixture>>, evaluationId: string, confirmContext: boolean) => startAutomaticGeneration(f.scope, evaluationId, {
    sourceRevisionIds: [f.source.revision_id], title: "Intake set", executionMode: "imported_responses", promptRevision: "dgx-context-cases-v4", maxCases: 2, complexity: "balanced", locale: "en",
  }, randomUUID(), { confirmContext });

  it("waits for the person, records the confirmed revision with author, time and edited fields, and every test names it", async () => {
    const f = await fixture();
    const evaluationId = await f.evaluation();
    const started = await start(f, evaluationId, true) as { jobId: string };
    const read = async (sql: string, params: unknown[]) => withTenant(f.scope, async (db) => (await db.query(sql, params)).rows);
    expect((await read("SELECT status,requested_by FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2", [f.orgId, started.jobId]))[0]).toEqual({ status: "requested", requested_by: f.actorId });

    // The profile is ready: generation stops before writing any test.
    await f.finish(started.jobId, "profile", f.profileOutput);
    const gate = await advanceAutomaticGeneration(f.scope, evaluationId, started.jobId, randomUUID());
    expect(gate).toMatchObject({ status: "needs_input", reasonCode: "context_confirmation_required" });
    expect(await advanceAutomaticGeneration(f.scope, evaluationId, started.jobId, randomUUID())).toMatchObject({ status: "needs_input", reasonCode: "context_confirmation_required" });
    // The scheduler leaves a waiting confirmation alone (it is not due).
    expect(await advancePendingGenerations({ orgId: f.orgId, actorId: "service:evals-scheduler" })).toBe(0);
    const [pending] = await read("SELECT status,base_profile_revision_id,evidence,due_at>now()+interval '25 minutes' AS later FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2", [f.orgId, started.jobId]);
    expect(pending).toMatchObject({ status: "pending", later: true });
    expect(pending.evidence.basis.purpose).toEqual([`${f.source.revision_id}:${f.anchor.id}`]);
    expect(await read("SELECT count(*)::int AS n FROM evals.context_profile_revision WHERE org_id=$1 AND evaluation_id=$2", [f.orgId, evaluationId])).toEqual([{ n: 1 }]);
    expect(await read("SELECT count(*)::int AS n FROM evals.workflow_step s JOIN evals.generation_job g ON g.org_id=s.org_id AND g.workflow_id=s.workflow_id WHERE g.id=$1 AND s.step_kind='generate'", [started.jobId])).toEqual([{ n: 0 }]);

    // The screen: plain fields, low confidence flagged, excerpts one click away.
    const view = await getContextConfirmation(f.scope, evaluationId, started.jobId);
    expect(view.confirmation).toMatchObject({ status: "pending", jobId: started.jobId });
    expect(view.context).toMatchObject({
      purpose: { value: "Explain policy A fees", low: false }, intendedUsers: { values: ["Accountants"], low: true },
      boundaries: { values: ["Never round more than once"] }, sources: [{ revisionId: f.source.revision_id, title: f.source.title, rank: 1 }],
    });
    expect(view.context!.purpose.excerpts[0]).toMatchObject({ sourceTitle: f.source.title, text: f.anchor.excerpt });
    // Another workspace sees nothing.
    expect(await getContextConfirmation({ orgId: randomUUID(), actorId: f.actorId }, evaluationId, started.jobId)).toEqual({ confirmation: null, context: null });

    // Confirm once, with two corrections.
    const key = randomUUID();
    const decision = { jobId: started.jobId, decision: "confirm" as const, edits: { purpose: "Explain policy A fees to accountants", intendedUsers: ["Accountants", "Auditors"], tasks: ["Fees"] } };
    const confirmed = await decideContextConfirmation(f.scope, evaluationId, decision, key);
    expect(confirmed).toMatchObject({ status: "profile_ready", decision: "confirmed", editedFields: ["purpose", "intended_users"] });
    expect(await decideContextConfirmation(f.scope, evaluationId, decision, key)).toEqual(confirmed);
    await expect(decideContextConfirmation(f.scope, evaluationId, { jobId: started.jobId, decision: "skip" }, randomUUID())).rejects.toMatchObject({ status: 409 });
    const [row] = await read("SELECT c.status,c.decided_by,c.decided_at IS NOT NULL AS decided,c.edited_fields,c.profile_revision_id,r.created_by,r.document->'purpose'->>'value' AS purpose FROM evals.context_confirmation c JOIN evals.context_profile_revision r ON (r.org_id,r.id)=(c.org_id,c.profile_revision_id) WHERE c.org_id=$1 AND c.generation_job_id=$2", [f.orgId, started.jobId]);
    expect(row).toMatchObject({ status: "confirmed", decided_by: f.actorId, decided: true, edited_fields: ["purpose", "intended_users"], created_by: f.actorId, purpose: "Explain policy A fees to accountants", profile_revision_id: confirmed.profileRevisionId });
    expect(row.profile_revision_id).not.toBe(pending.base_profile_revision_id);
    expect((await owner.query("SELECT action,details->>'profileRevisionId' AS revision FROM evals.audit_event WHERE org_id=$1 AND subject_id=$2", [f.orgId, started.jobId])).rows).toEqual([{ action: "context.confirmed", revision: confirmed.profileRevisionId }]);
    // A decision is immutable, even for the owner role.
    await expect(owner.query("UPDATE evals.context_confirmation SET edited_fields='{}' WHERE generation_job_id=$1", [started.jobId])).rejects.toThrow(/immutable/);

    // Generation drafts from the confirmed profile...
    expect(await advanceAutomaticGeneration(f.scope, evaluationId, started.jobId, randomUUID())).toMatchObject({ status: "drafting" });
    const [draftStep] = await read("SELECT s.input FROM evals.workflow_step s JOIN evals.generation_job g ON g.org_id=s.org_id AND g.workflow_id=s.workflow_id WHERE g.id=$1 AND s.step_kind='generate' ORDER BY s.version DESC LIMIT 1", [started.jobId]);
    const request = JSON.parse(draftStep.input.messages[1].content);
    expect(request.profile.purpose.value).toBe("Explain policy A fees to accountants");
    expect(request.profile.intended_users).toEqual(["Accountants", "Auditors"]);
    // ...and every test it writes names that revision.
    await f.finish(started.jobId, "generate", f.draftOutput);
    expect(await advanceAutomaticGeneration(f.scope, evaluationId, started.jobId, randomUUID())).toMatchObject({ status: "needs_review" });
    // The validated draft's cases (generation_batch 'validate' output), as the Prepare page reads them.
    const cases = await read(`SELECT cr.document->'extensions' AS extensions FROM evals.generation_batch b
      JOIN evals.case_revision cr ON cr.org_id=b.org_id AND cr.id::text IN (SELECT jsonb_array_elements_text(b.output->'caseRevisionIds'))
      WHERE b.org_id=$1 AND b.generation_job_id=$2 AND b.step_kind='validate' AND b.status='completed'`, [f.orgId, started.jobId]);
    expect(cases).toHaveLength(2);
    for (const item of cases) expect(item.extensions[CONTEXT_EXTENSION]).toEqual({ profile_revision_id: confirmed.profileRevisionId, confirmation_id: view.confirmation!.id, confirmed: true, status: "confirmed" });
  });

  it("continues with the inferred profile after the wait, marks the tests and leaves people-free starts alone", async () => {
    const f = await fixture();
    const evaluationId = await f.evaluation();
    const started = await start(f, evaluationId, true) as { jobId: string };
    await f.finish(started.jobId, "profile", f.profileOutput);
    await advanceAutomaticGeneration(f.scope, evaluationId, started.jobId, randomUUID());
    await owner.query("UPDATE evals.context_confirmation SET due_at=now()-interval '1 minute' WHERE generation_job_id=$1", [started.jobId]);
    const scheduler = { orgId: f.orgId, actorId: "service:evals-scheduler" };
    await advancePendingGenerations(scheduler);
    const [skipped] = await withTenant(f.scope, async (db) => (await db.query("SELECT status,skip_reason,decided_by,profile_revision_id=base_profile_revision_id AS inferred FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2", [f.orgId, started.jobId])).rows);
    expect(skipped).toEqual({ status: "skipped", skip_reason: "timeout", decided_by: null, inferred: true });
    await owner.query("UPDATE evals.generation_job SET updated_at=now()-interval '1 minute' WHERE id=$1", [started.jobId]);
    expect(await advancePendingGenerations(scheduler)).toBe(1);
    await f.finish(started.jobId, "generate", f.draftOutput);
    expect(await advancePendingGenerations(scheduler)).toBe(1);
    const extensions = await withTenant(f.scope, async (db) => (await db.query(`SELECT cr.document->'extensions'->$3 AS context FROM evals.generation_batch b
      JOIN evals.case_revision cr ON cr.org_id=b.org_id AND cr.id::text IN (SELECT jsonb_array_elements_text(b.output->'caseRevisionIds'))
      WHERE b.org_id=$1 AND b.generation_job_id=$2 AND b.step_kind='validate' AND b.status='completed'`, [f.orgId, started.jobId, CONTEXT_EXTENSION])).rows);
    expect(extensions.map((item) => item.context)).toEqual([expect.objectContaining({ confirmed: false, status: "skipped", skip_reason: "timeout" }), expect.objectContaining({ confirmed: false })]);

    // A start nobody asked to confirm (onboarding, restarts, flag off) drafts straight away and writes no extension.
    const other = await f.evaluation();
    const plain = await start(f, other, false) as { jobId: string };
    await f.finish(plain.jobId, "profile", f.profileOutput);
    expect(await advanceAutomaticGeneration(f.scope, other, plain.jobId, randomUUID())).toMatchObject({ status: "drafting" });
    expect(await withTenant(f.scope, async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2", [f.orgId, plain.jobId])).rows[0].n)).toBe(0);
  });

  it("says “Context not confirmed by the customer” in the report methodology only when it was skipped", async () => {
    const context = (status: "skipped" | "confirmed") => ({ [CONTEXT_EXTENSION]: { profile_revision_id: randomUUID(), confirmation_id: randomUUID(), confirmed: status === "confirmed", status } });
    for (const status of ["skipped", "confirmed"] as const) {
      const { scope, run } = await importedJudgeRunFixture(owner, runtimeUrl!, { caseExtensions: context(status) });
      await scoreRun(scope, run.id, "customer-manual-deterministic-v1");
      const report = await createReportForRun(scope, { runId: run.id, title: "Intake", reviewStatus: "preliminary", scorerVersion: "strict-v1" }, randomUUID());
      const [snapshot] = await withTenant(scope, async (db) => (await db.query("SELECT snapshot FROM evals.report_revision WHERE org_id=$1 AND id=$2", [scope.orgId, report.revisionId])).rows);
      expect(snapshot.snapshot.methodology.limitations.includes(CONTEXT_NOT_CONFIRMED)).toBe(status === "skipped");
    }
  });

  it("skips a file already in the evaluation, allows 50 files with intake v2, and keeps the 20-file limit without it", async () => {
    const f = await fixture();
    const evaluationId = await f.evaluation();
    const upload = (index: number, intakeV2: boolean, content = `file ${index}`) => {
      const bytes = Buffer.from(content);
      return createUpload(f.scope, { projectId: f.projectId, evaluationId, title: `file-${index}.txt`, mediaType: "text/plain", byteSize: bytes.length, sha256: sha256(bytes), rights: "customer_owned" }, randomUUID(), { intakeV2 });
    };
    const first = await upload(0, true) as { sourceId: string };
    expect(await upload(0, true)).toMatchObject({ duplicate: true, sourceId: first.sourceId });
    // Without the flag the same bytes make a second source, as before.
    const copy = await upload(0, false) as { sourceId: string; duplicate?: boolean };
    expect(copy.duplicate).toBeUndefined();
    expect(copy.sourceId).not.toBe(first.sourceId);
    for (let index = 1; index < 18; index++) await upload(index, false);
    // 19 files now: one more fits the classic 20-file limit, then it refuses.
    await upload(18, false);
    await expect(upload(19, false)).rejects.toMatchObject({ status: 413 });
    for (let index = 19; index < 49; index++) await upload(index, true);
    await expect(upload(50, true)).rejects.toMatchObject({ status: 413 });
    // A duplicate still answers at the cap: it adds nothing.
    expect(await upload(7, true)).toMatchObject({ duplicate: true });
  });

  it("imports only listed pages, within the plan cap, as one website source with its settings", async () => {
    const f = await fixture();
    const evaluationId = await f.evaluation();
    const created = await createWebsitePreview(f.scope, { evaluationId, url: "https://help.example.test/help", sitemapUrl: null, pathPrefix: "help" }, randomUUID());
    expect(created).toMatchObject({ status: "queued", cap: 50 });
    await expect(importWebsitePreview(f.scope, { evaluationId, projectId: f.projectId, previewId: created.previewId, selectedUrls: ["https://help.example.test/help"] }, randomUUID())).rejects.toMatchObject({ status: 409 });
    const pages = Array.from({ length: 60 }, (_, index) => `https://help.example.test/help/article-${index}`);
    // What the browser worker writes once the sitemap is read.
    await owner.query("UPDATE evals.website_page_preview SET status='ready',origin='https://help.example.test',discovered_from='sitemap',pages=$2::jsonb,found_total=60,robots_excluded=2,outside_prefix=5 WHERE id=$1", [created.previewId, JSON.stringify(pages)]);
    const view = await getWebsitePreview(f.scope, created.previewId);
    expect(view).toMatchObject({ status: "ready", pathPrefix: "/help", cap: 50, foundTotal: 60, robotsExcluded: 2, outsidePrefix: 5, estimate: { creditsPerPage: "1" } });
    expect(view.pages).toHaveLength(60);
    await expect(getWebsitePreview({ orgId: randomUUID(), actorId: f.actorId }, created.previewId)).rejects.toMatchObject({ status: 404 });
    await expect(importWebsitePreview(f.scope, { evaluationId, projectId: f.projectId, previewId: created.previewId, selectedUrls: ["https://other.test/help"] }, randomUUID())).rejects.toMatchObject({ status: 422 });
    await expect(importWebsitePreview(f.scope, { evaluationId, projectId: f.projectId, previewId: created.previewId, selectedUrls: pages.slice(0, 51) }, randomUUID())).rejects.toMatchObject({ status: 422 });
    const imported = await importWebsitePreview(f.scope, { evaluationId, projectId: f.projectId, previewId: created.previewId, selectedUrls: pages.slice(0, 3) }, randomUUID()) as { sourceId: string; pages: number };
    expect(imported.pages).toBe(3);
    const [job] = await withTenant(f.scope, async (db) => (await db.query("SELECT start_url,page_limit,selected_urls,path_prefix,preview_id FROM evals.website_source_job WHERE org_id=$1 AND source_id=$2", [f.orgId, imported.sourceId])).rows);
    expect(job).toEqual({ start_url: "https://help.example.test/help", page_limit: 3, selected_urls: pages.slice(0, 3), path_prefix: "/help", preview_id: created.previewId });
    const source = await getSource(f.scope, imported.sourceId);
    expect(source.websiteCapture).toMatchObject({ selected_pages: 3, page_limit: 3, pages_read: null });
    // The database refuses more selected pages than the limit, and limits above 200.
    await expect(owner.query("UPDATE evals.website_source_job SET page_limit=2 WHERE source_id=$1", [imported.sourceId])).rejects.toThrow();
    await expect(owner.query("UPDATE evals.website_source_job SET page_limit=201,selected_urls=NULL WHERE source_id=$1", [imported.sourceId])).rejects.toThrow();
  });
});
