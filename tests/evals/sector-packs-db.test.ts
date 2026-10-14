import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { caseSchema, sourceSchema, type CefCase, type Source } from "../../lib/evals/contracts/cases";
import { canonicalJson, sha256, withContentHash } from "../../lib/evals/contracts/hashing";
import { genericGroundedQaPack } from "../../lib/evals/generation/packs";
import { digest } from "../../lib/evals/queue/store";
import { createPrefixedId } from "../../lib/operator/ids";
import {
  addSectorQuestions, getPackVersion, importPackFile, listPacks, openPackVersion, packRole, removePackItem, reviewPackItem,
  savePackItem, sectorSuggestion, setLibrarySetting, transitionPackVersion,
} from "../../lib/evals/sector-packs/store";
import { advanceSourceRefreshes, decideProposals, listProposals, monthlyQuestionsDue, periodOf, retrySourceRefresh, startSourceRefresh } from "../../lib/evals/sector-packs/refresh";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const schedulerUrl = process.env.EVALS_TEST_SCHEDULER_URL;
const endpoint = process.env.EVALS_TEST_S3_ENDPOINT;
const seed = JSON.parse(readFileSync("content/sector-packs/es-fiscal-contable-laboral.json", "utf8"));
const access = { candidate: false, judge: true, customer: true, public: false };

async function tx<T>(owner: Pool, work: (db: PoolClient) => Promise<T>) {
  const db = await owner.connect();
  try {
    await db.query("BEGIN");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
async function user(db: PoolClient, name: string) {
  const id = createPrefixedId("au");
  await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, `${randomUUID()}@example.test`]);
  return id;
}
async function expert(db: PoolClient, createdBy: string, eligibility: "eligible" | "calibrating") {
  const id = await user(db, `Expert ${eligibility}`);
  await db.query(`INSERT INTO evals.expert_profile(user_id,domains,jurisdictions,languages,credentials_status,terms_status,eligibility_status,created_by)
    VALUES($1,ARRAY['fiscal_accounting_payroll'],ARRAY['ES'],ARRAY['es'],'verified','accepted',$2,$3)`, [id, eligibility, createdBy]);
  return id;
}
const code = (error: unknown) => (error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "");

/** A website capture in the reader's format, cut into fixed-width anchors. */
function website(sourceId: string, pages: Array<[string, string]>, path: string): { document: Source; bytes: Buffer } {
  const markdown = pages.map(([url, text]) => `# ${url.split("/").at(-1)}\n\nSource URL: ${url}\n\n${text}`).join("\n\n---\n\n");
  // One excerpt per page, as the extractor's chunks of a short page would be.
  const starts = [0, ...[...markdown.matchAll(/\n\n---\n\n/g)].map((match) => (match.index ?? 0) + match[0].length)];
  const anchors = starts.map((start, index) => {
    const end = starts[index + 1] ?? markdown.length;
    return { id: randomUUID(), excerpt: markdown.slice(start, end), locator: `utf16:${start}:${end}` };
  });
  const bytes = Buffer.from(markdown);
  const document = sourceSchema.parse(withContentHash({
    schema_version: "1.0", source_id: sourceId, revision_id: randomUUID(), title: "help.example.com",
    artifact: { path, sha256: sha256(bytes), size_bytes: bytes.length, media_type: "text/markdown", visibility: "internal" },
    anchors, access, rights: "customer_owned", created_at: new Date().toISOString(), extensions: {},
  }));
  return { document, bytes };
}
async function insertRevision(db: PoolClient, orgId: string, projectId: string, document: Source, existingArtifactId?: string) {
  const artifactId = existingArtifactId ?? randomUUID();
  if (existingArtifactId) await db.query("UPDATE evals.artifact SET state='ready',object_key=$3,expires_at=now()+interval '30 days' WHERE org_id=$1 AND id=$2", [orgId, artifactId, `test/${artifactId}`]);
  else await db.query("INSERT INTO evals.artifact(id,org_id,project_id,export_path,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'text/markdown','ready',now()+interval '30 days')",
    [artifactId, orgId, projectId, document.artifact.path, `test/${artifactId}`, document.artifact.sha256, document.artifact.size_bytes]);
  await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'website-v1')",
    [document.revision_id, orgId, document.source_id, artifactId, document.content_hash, document]);
  for (const [ordinal, anchor] of document.anchors.entries()) {
    const [, start, end] = anchor.locator.split(":");
    await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,$4,$5,$6)", [anchor.id, orgId, document.revision_id, ordinal, anchor.excerpt, { start: Number(start), end: Number(end) }]);
  }
  return artifactId;
}

/** A workspace with a frozen, source-grounded test set built from a captured website. */
async function workspaceFixture(owner: Pool, ownerId: string, pages: Array<[string, string]>, questions: Array<{ question: string; expected: string; quote: string }>) {
  const orgId = randomUUID(), projectId = randomUUID(), sourceId = randomUUID(), suiteId = randomUUID(), suiteVersionId = randomUUID(), evaluationId = randomUUID();
  const { document } = website(sourceId, pages, `sources/website-${sourceId}.md`);
  const anchorFor = (quote: string) => document.anchors.find((anchor) => anchor.excerpt.includes(quote))!.id;
  const pack = genericGroundedQaPack({ source: document, authorId: ownerId, questions: questions.map((item) => ({ question: item.question, expected: item.expected, anchor: anchorFor(item.quote), language: "en" })) });
  const manifest = withContentHash({
    schema_version: "1.0", suite_id: suiteId, suite_version_id: suiteVersionId, title: "Help centre set", created_at: new Date().toISOString(),
    scope: { domain: "generic", languages: ["en"], jurisdictions: [], as_of: null, description: "Fixture set." },
    execution_mode: "deployed_system", evidence_policy: "source_grounded",
    case_revisions: pack.cases.map((item) => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split, weight: item.weight })),
    source_revisions: [{ revision_id: document.revision_id, content_hash: document.content_hash }],
    rubric_revisions: [{ revision_id: pack.rubric.revision_id, content_hash: pack.rubric.content_hash }], fixture_revisions: [], output_schema_revisions: [],
    execution_policy: { limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, session: "fresh_per_case", retry: { max_attempts: 3, retryable_statuses: ["transport_error"], uncertain_outcome: "pause_for_review" } },
    scoring_policy: { metric_version: "strict-v1", weighting: "case_weight", thresholds: { pass: 1, partial: 0.5 }, exclusions: ["unsupported"], review: "failures_and_disputes", comparison: "paired_family" },
    sampling_plan: { procedure: "all", seed: 0, planned_repetitions: 1, stopping_rules: { max_cases: pack.cases.length, max_duration_ms: 3600000, early_stopping: false } },
    visibility_policy: { cases: { ...access, candidate: true }, sources: access, rubrics: access, observations: access, assessments: access, allow_candidate_holdout: false, publication_consent_id: null },
    files: [{ path: document.artifact.path, sha256: document.artifact.sha256, size_bytes: document.artifact.size_bytes }], extensions: {},
  });
  await tx(owner, async (db) => {
    await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [ownerId, orgId]);
    await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Sector fixture',$2)", [orgId, ownerId]);
    await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, ownerId]);
    await db.query("INSERT INTO evals.project(id,org_id,title,description) VALUES($1,$2,'Sector fixture','Answers customer questions about the account')", [projectId, orgId]);
    await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,'help.example.com','customer_owned')", [sourceId, orgId, projectId]);
    const firstArtifact = await insertRevision(db, orgId, projectId, document);
    await db.query("INSERT INTO evals.source_upload(org_id,source_id,artifact_id) VALUES($1,$2,$3)", [orgId, sourceId, firstArtifact]);
    await db.query("INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [pack.rubric.revision_id, orgId, projectId, pack.rubric.content_hash, pack.rubric]);
    for (const item of pack.cases) {
      await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, orgId, projectId]);
      await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [item.revision_id, orgId, item.case_id, item.family_id, item.split, item.content_hash, item, pack.rubric.revision_id]);
    }
    await db.query("INSERT INTO evals.suite(id,org_id,project_id,title,draft) VALUES($1,$2,$3,'Help centre set',$4)", [suiteId, orgId, projectId, manifest]);
    await db.query("INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)", [suiteVersionId, orgId, suiteId, manifest.content_hash, manifest]);
    for (const [ordinal, item] of pack.cases.entries()) await db.query("INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)", [orgId, suiteVersionId, item.revision_id, ordinal]);
    await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status) VALUES($1,$2,$3,'Help assistant','source_grounded',5,'EUR','ready')", [evaluationId, orgId, projectId]);
    await db.query("UPDATE evals.evaluation SET selected_suite_version_id=$3 WHERE org_id=$1 AND id=$2", [orgId, evaluationId, suiteVersionId]);
    await db.query("UPDATE evals.source SET evaluation_id=$3 WHERE org_id=$1 AND id=$2", [orgId, sourceId, evaluationId]);
    await db.query(`INSERT INTO evals.website_source_job(org_id,evaluation_id,source_id,start_url,page_limit,status,source_revision_id,created_by,created_at,updated_at)
      VALUES($1,$2,$3,'https://help.example.com/',25,'completed',$4,$5,now()-interval '60 days',now()-interval '60 days')`, [orgId, evaluationId, sourceId, document.revision_id, ownerId]);
  });
  return { orgId, projectId, sourceId, suiteId, suiteVersionId, evaluationId, document, cases: pack.cases };
}

describe.skipIf(!ownerUrl || !runtimeUrl)("sector packs and monthly new questions on PostgreSQL (launch L-25)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
  let staffId = "", eligibleId = "", calibratingId = "", customerId = "";
  let versionId = "";
  beforeAll(async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    if (endpoint) {
      for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-sector-packs-test", DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
      const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
      await s3.send(new CreateBucketCommand({ Bucket: "evals-sector-packs-test" })).catch(() => undefined);
      s3.destroy();
    }
    await tx(owner, async (db) => {
      staffId = await user(db, "Ops staff");
      await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [staffId]);
      eligibleId = await expert(db, staffId, "eligible");
      calibratingId = await expert(db, staffId, "calibrating");
      customerId = await user(db, "Customer owner");
    });
  });
  afterAll(async () => { vi.unstubAllEnvs(); await owner.end(); await runtime.end(); await getEvalsPool().end(); });

  it("keeps customer material and customers out of packs", async () => {
    // The runtime role has no write grant: every write goes through the checked functions.
    await expect(withTenant({ orgId: "", actorId: staffId }, (db) => db.query("INSERT INTO evals.sector_pack(id,sector,jurisdiction,language,domain_pack_id,title,summary,created_by,updated_by) VALUES('x-pack','insurance','ES','es','generic-grounded-qa','{\"en\":\"a\",\"es\":\"a\"}','{\"en\":\"a\",\"es\":\"a\"}','x','x')"), runtime))
      .rejects.toMatchObject({ code: "42501" });
    // A customer (no platform role, no expert profile) cannot import or open a pack.
    await expect(importPackFile(customerId, seed)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 403 });
    expect(await packRole(customerId, null)).toEqual({ staff: false, expert: false, reviewer: false });
    // Staff import the seed as a draft: every question pending expert review.
    const imported = await importPackFile(staffId, seed);
    expect(imported).toMatchObject({ packId: "es-fiscal-contable-laboral", opened: true, created: seed.items.length, updated: 0, items: seed.items.length, pending: seed.items.length });
    versionId = imported.versionId;
    // Importing the same file again changes nothing.
    expect(await importPackFile(staffId, seed)).toMatchObject({ versionId, opened: false, created: 0, updated: 0, unchanged: seed.items.length });
    // Drafts are invisible to customers (RLS), visible to staff and experts.
    expect(await listPacks(customerId)).toEqual([]);
    expect((await listPacks(eligibleId))[0].versions[0]).toMatchObject({ status: "draft", items: seed.items.length, approved: 0 });
    const item = seed.items[0];
    const fingerprint = "a".repeat(64);
    const raw = (actor: string, orgId: string, value: object) => withTenant({ orgId, actorId: actor }, (db) => db.query("SELECT evals.sector_pack_item_save($1,$2,$3)", [versionId, JSON.stringify({ language: "es", ...value }), fingerprint]));
    // Inside a workspace transaction (where customer data is readable) pack writes are refused.
    const workspace = await workspaceFixture(owner, customerId, [["https://help.example.com/fees", "The account fee is 5 euros a month."]], [{ question: "How much is the account fee?", expected: "5 euros a month.", quote: "5 euros" }]);
    await expect(raw(staffId, workspace.orgId, { ...item, key: "inside-workspace" })).rejects.toMatchObject({ code: "42501" });
    // Customer-owned rights, another scope, or a workspace reference never enter a pack.
    await expect(raw(staffId, "", { ...item, key: "customer-rights", rights: { kind: "customer_owned", basis: "The customer's own help centre pages." } })).rejects.toMatchObject({ code: "23514" });
    await expect(raw(staffId, "", { ...item, key: "customer-scope", scope: "customer_specific" })).rejects.toMatchObject({ code: "23514" });
    await expect(raw(staffId, "", { ...item, key: "with-workspace", org_id: workspace.orgId })).rejects.toMatchObject({ code: "22023" });
    await expect(raw(customerId, "", { ...item, key: "by-customer" })).rejects.toMatchObject({ code: "42501" });
    // Deduplication: the same question under another key is refused.
    await expect(savePackItem(staffId, versionId, { ...item, key: "same-question-again" })).rejects.toMatchObject({ status: 409 });
  });

  it("publishes only expert-reviewed versions, and keeps published versions immutable", async () => {
    // A draft cannot be published directly, and reviews wait for the review state.
    await expect(transitionPackVersion(staffId, versionId, "published")).rejects.toMatchObject({ status: 409 });
    const detail = await getPackVersion(staffId, versionId, { staff: true, expert: false, reviewer: false });
    await expect(reviewPackItem(eligibleId, detail.items[0].id, "approved", null)).rejects.toMatchObject({ status: 409 });
    // An expert drafts one more question; experts cannot move versions.
    const extra = { ...seed.items[1], key: "expert-drafted", question: "¿Una pregunta redactada por una experta para la prueba?" };
    const added = await savePackItem(eligibleId, versionId, extra);
    await expect(transitionPackVersion(eligibleId, versionId, "in_review")).rejects.toMatchObject({ status: 403 });
    await transitionPackVersion(staffId, versionId, "in_review");
    // The author cannot review their own question; a calibrating expert cannot review at all.
    await expect(reviewPackItem(eligibleId, added.id, "approved", null)).rejects.toMatchObject({ status: 403 });
    await expect(reviewPackItem(calibratingId, detail.items[0].id, "approved", null)).rejects.toMatchObject({ status: 403 });
    await removePackItem(staffId, added.id);
    // Nothing is published without a recorded reviewer for every question.
    await expect(transitionPackVersion(staffId, versionId, "published")).rejects.toMatchObject({ status: 409 });
    const items = (await getPackVersion(staffId, versionId, { staff: true, expert: false, reviewer: false })).items;
    expect(items).toHaveLength(seed.items.length);
    await reviewPackItem(eligibleId, items[0].id, "changes_requested", "Cite the paragraph, not the whole article.");
    for (const row of items.slice(1)) await reviewPackItem(eligibleId, row.id, "approved", null);
    await expect(transitionPackVersion(staffId, versionId, "published")).rejects.toMatchObject({ status: 409 });
    // An edit resets the review; the expert approves the new text.
    await savePackItem(staffId, versionId, { ...seed.items.find((row: { key: string }) => row.key === items[0].key), authorNote: "Narrowed the question.", expected: `${items[0].expected} ` + "(Revisado.)" });
    const edited = (await getPackVersion(staffId, versionId, { staff: true, expert: false, reviewer: false })).items.find((row) => row.key === items[0].key)!;
    expect(edited.review).toMatchObject({ status: "pending", reviewerId: null });
    await reviewPackItem(eligibleId, edited.id, "approved", null);
    await transitionPackVersion(staffId, versionId, "published");
    const published = await getPackVersion(customerId, versionId, { staff: false, expert: false, reviewer: false });
    expect(published.version).toMatchObject({ status: "published", approved: seed.items.length });
    expect(published.version.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(published.items.every((row) => row.review.status === "approved" && row.review.reviewerId === eligibleId)).toBe(true);
    // Immutable, even for the table owner.
    await expect(savePackItem(staffId, versionId, seed.items[2])).rejects.toMatchObject({ status: 409 });
    await expect(removePackItem(staffId, published.items[0].id)).rejects.toMatchObject({ status: 409 });
    await expect(transitionPackVersion(staffId, versionId, "draft")).rejects.toMatchObject({ status: 409 });
    for (const statement of [
      "UPDATE evals.sector_pack_item SET question=question||'?' WHERE pack_version_id=$1",
      "DELETE FROM evals.sector_pack_item WHERE pack_version_id=$1",
      "UPDATE evals.sector_pack_version SET notes='changed' WHERE id=$1",
      "DELETE FROM evals.sector_pack_version WHERE id=$1",
    ]) await expect(tx(owner, (db) => db.query(statement, [versionId]))).rejects.toMatchObject({ code: "55000" });
    // A new version copies the published one with its recorded reviews.
    const next = await openPackVersion(staffId, "es-fiscal-contable-laboral", "v2");
    const copy = await getPackVersion(staffId, next.id, { staff: true, expert: false, reviewer: false });
    expect(copy.version).toMatchObject({ version: 2, status: "draft", approved: seed.items.length });
  });

  it("adds a published pack's questions to a test set as a new version with sector_generic provenance", async () => {
    const fixture = await workspaceFixture(owner, customerId, [["https://help.example.com/fees", "The account fee is 5 euros a month."]], [{ question: "How much is the account fee?", expected: "5 euros a month.", quote: "5 euros" }]);
    const scope = { orgId: fixture.orgId, actorId: customerId };
    // No sector yet: the sectors with a published pack are offered.
    expect(await sectorSuggestion(scope, fixture.suiteId)).toMatchObject({ sector: null, sectors: ["fiscal_accounting_payroll"], packs: [] });
    await setLibrarySetting(scope, { sector: "fiscal_accounting_payroll" });
    const suggestion = await sectorSuggestion(scope, fixture.suiteId);
    expect(suggestion.packs).toHaveLength(1);
    expect(suggestion.packs[0]).toMatchObject({ versionId, missing: seed.items.length, added: 0 });
    // A draft version cannot be added.
    const draft = (await listPacks(staffId))[0].versions.find((version) => version.status === "draft")!;
    await expect(addSectorQuestions(scope, fixture.suiteId, draft.id, randomUUID())).rejects.toMatchObject({ status: 404 });
    const key = randomUUID();
    const result = await addSectorQuestions(scope, fixture.suiteId, versionId, key);
    expect(result).toMatchObject({ added: seed.items.length, status: "frozen" });
    // A retry is the same request; adding again finds nothing missing.
    expect(await addSectorQuestions(scope, fixture.suiteId, versionId, key)).toMatchObject({ added: seed.items.length, suiteVersionId: result.suiteVersionId });
    expect(await addSectorQuestions(scope, fixture.suiteId, versionId, randomUUID())).toMatchObject({ added: 0 });
    expect((await sectorSuggestion(scope, fixture.suiteId)).packs[0]).toMatchObject({ missing: 0, added: seed.items.length });
    await withTenant(scope, async (db) => {
      const manifest = (await db.query("SELECT manifest FROM evals.suite_version WHERE org_id=$1 AND id=$2", [fixture.orgId, result.suiteVersionId])).rows[0].manifest;
      expect(manifest.case_revisions).toHaveLength(seed.items.length + 1);
      const cases = (await db.query("SELECT document FROM evals.case_revision WHERE org_id=$1 AND id=ANY($2::uuid[])", [fixture.orgId, manifest.case_revisions.map((item: { revision_id: string }) => item.revision_id)])).rows.map((row) => caseSchema.parse(row.document));
      const fromPack = cases.filter((item) => item.extensions["caudals.evals/sector-pack"]);
      expect(fromPack).toHaveLength(seed.items.length);
      for (const item of fromPack) {
        expect(item.tags).toContain("sector_generic");
        expect(item.provenance).toMatchObject({ method: "human_authored", evidence_level: "expert_reviewed", reviewer_ids: [eligibleId] });
        expect(["public_domain", "licensed"]).toContain(item.provenance.rights);
        expect(item.extensions["caudals.evals/sector-pack"]).toMatchObject({ scope: "sector_generic", pack_version_id: versionId, added_by: customerId });
        const ref = item.reference.source_refs[0];
        const source = sourceSchema.parse((await db.query("SELECT document FROM evals.source_revision WHERE org_id=$1 AND id=$2", [fixture.orgId, ref.source_revision_id])).rows[0].document);
        expect(source.extensions["caudals.evals/sector-pack-source"]).toMatchObject({ pack_version_id: versionId, scope: "sector_generic" });
        const excerpt = source.anchors.find((anchor) => anchor.id === ref.anchor)!.excerpt;
        for (const fact of item.reference.required_claims) expect(excerpt.toLowerCase()).toContain(fact.toLowerCase());
      }
      expect(Number((await db.query("SELECT count(*) FROM evals.sector_pack_case_link WHERE org_id=$1", [fixture.orgId])).rows[0].count)).toBe(seed.items.length);
      const audit = (await db.query("SELECT details FROM evals.audit_event WHERE org_id=$1 AND action='suite.sector_questions_added'", [fixture.orgId])).rows;
      expect(audit).toHaveLength(1);
    });
    // Links only ever point at published items.
    const draftItem = (await getPackVersion(staffId, draft.id, { staff: true, expert: false, reviewer: false })).items[0];
    await expect(withTenant(scope, async (db) => {
      const row = (await db.query("SELECT case_revision_id FROM evals.sector_pack_case_link WHERE org_id=$1 LIMIT 1", [fixture.orgId])).rows[0];
      await db.query("INSERT INTO evals.sector_pack_case_link(org_id,case_revision_id,pack_item_id,suite_id) VALUES($1,$2,$3,$4)", [fixture.orgId, fixture.cases[0].revision_id, draftItem.id, fixture.suiteId]);
      return row;
    })).rejects.toMatchObject({ code: "42501" });
    // Statistics are counts only and withheld below three workspaces.
    const stats = await getPackVersion(staffId, versionId, { staff: true, expert: false, reviewer: false });
    expect(stats.items[0].stats).toEqual({ workspaces: 0, results: 0, passed: null, partial: null, failed: null });
  });

  it("re-reads website sources monthly, proposes questions for changed pages, and approves them into a new version", async () => {
    const pages: Array<[string, string]> = [
      ["https://help.example.com/fees", "The account fee is 5 euros a month. Debit cards are free of charge for every account holder."],
      ["https://help.example.com/limits", "Transfers are limited to 10,000 euros a day for personal accounts."],
    ];
    const fixture = await workspaceFixture(owner, customerId, pages, [{ question: "What daily limit applies to transfers?", expected: "10,000 euros a day.", quote: "10,000 euros a day" }]);
    const scope = { orgId: fixture.orgId, actorId: customerId };
    const scheduler = { orgId: fixture.orgId, actorId: "service:evals-scheduler" };
    // Off by default; the free plan cannot turn it on.
    await tx(owner, (db) => db.query("UPDATE evals.workspace_entitlement SET plan='free' WHERE org_id=$1", [fixture.orgId]));
    await expect(setLibrarySetting(scope, { monthlyQuestions: true })).rejects.toMatchObject({ status: 409 });
    await tx(owner, (db) => db.query("UPDATE evals.workspace_entitlement SET plan='managed' WHERE org_id=$1", [fixture.orgId]));
    expect(await advanceSourceRefreshes(scheduler)).toEqual({ started: 0, advanced: 0 });
    await setLibrarySetting(scope, { monthlyQuestions: true });
    if (schedulerUrl) {
      const due = await withTenant({ orgId: "", actorId: "service:evals-scheduler" }, async (db) => (await db.query("SELECT evals.monthly_questions_due() AS id")).rows.map((row) => row.id), new Pool({ connectionString: schedulerUrl, max: 1 }));
      expect(due).toContain(fixture.orgId);
    }
    // Only the scheduler's role may list the opted-in workspaces; the web runtime may not.
    await expect(monthlyQuestionsDue("service:evals-scheduler")).rejects.toMatchObject({ code: "42501" });
    // The month's first pass re-reads the source with the existing reader (a new website job), once.
    expect(await advanceSourceRefreshes(scheduler)).toMatchObject({ started: 1 });
    expect(await advanceSourceRefreshes(scheduler)).toMatchObject({ started: 0 });
    const refresh = await withTenant(scope, async (db) => (await db.query("SELECT * FROM evals.source_refresh WHERE org_id=$1", [fixture.orgId])).rows[0]);
    expect(refresh).toMatchObject({ period: periodOf(new Date()), status: "reading", source_id: fixture.sourceId, suite_id: fixture.suiteId, previous_revision_id: fixture.document.revision_id });
    const job = await withTenant(scope, async (db) => (await db.query("SELECT * FROM evals.website_source_job WHERE org_id=$1 AND id=$2", [fixture.orgId, refresh.website_job_id])).rows[0]);
    expect(job).toMatchObject({ status: "queued", start_url: "https://help.example.com/", page_limit: 25, source_id: fixture.sourceId });
    // The reader captures a changed fee page, the same limits page and a new page.
    const reread = website(fixture.sourceId, [
      ["https://help.example.com/fees", "The account fee is 7 euros a month. Debit cards are free of charge for every account holder."],
      pages[1],
      ["https://help.example.com/instant", "Instant transfers cost 0.50 euros each and arrive within ten seconds."],
    ], `sources/website-${fixture.sourceId}-${job.id}.md`);
    const next = reread.document;
    // The document worker's persistence step for a second reading of the same source: its own file path, the first upload record kept.
    await tx(owner, (db) => db.query("UPDATE evals.website_source_job SET status='persisting' WHERE org_id=$1 AND id=$2", [fixture.orgId, job.id]));
    // As the document worker's own database role (a fresh module graph, so a separate pool).
    vi.resetModules();
    process.env.EVALS_DATABASE_URL = process.env.EVALS_TEST_DOCUMENTS_DATABASE_URL ?? runtimeUrl!;
    const documents = await import("../../lib/evals/repositories/evidence");
    const documentsDb = await import("../../lib/evals/repositories/db");
    const stored = await documents.createWebsiteCaptureArtifact({ orgId: fixture.orgId, actorId: "service:evals-documents" }, job.id, reread.bytes);
    await documentsDb.getEvalsPool().end();
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    expect(stored).toMatchObject({ export_path: `sources/website-${fixture.sourceId}-${job.id}.md`, sha256: next.artifact.sha256, byte_size: next.artifact.size_bytes });
    // Fixture: the browser and document workers' result, then a generator route on the DGX.
    const providerId = randomUUID(), priceId = randomUUID(), accountId = randomUUID();
    await tx(owner, async (db) => {
      await insertRevision(db, fixture.orgId, fixture.projectId, next, stored.id);
      await db.query("UPDATE evals.website_source_job SET status='completed',source_revision_id=$3 WHERE org_id=$1 AND id=$2", [fixture.orgId, job.id, next.revision_id]);
      await db.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'sector fixture','EUR',100,true)", [accountId]);
      await db.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
        VALUES($1,$2,'dgx','http://dgx.invalid/v1','fixture-generator','fixture',ARRAY['generator'],'{"text":true,"boundedTokens":true,"jsonObject":true}',32768,8192,ARRAY['synthetic'],ARRAY['private'],1000,10000000,4)`, [providerId, accountId]);
      await db.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [priceId, providerId]);
      await db.query("INSERT INTO evals.generation_provider_route(org_id,role,provider_revision_id,price_revision_id,data_class,region,internal_cost_per_second,updated_by) VALUES($1,'generator',$2,$3,'synthetic','private',0.0001,$4)", [fixture.orgId, providerId, priceId, customerId]);
    });
    await advanceSourceRefreshes(scheduler);
    const drafting = await withTenant(scope, async (db) => (await db.query("SELECT * FROM evals.source_refresh WHERE org_id=$1 AND id=$2", [fixture.orgId, refresh.id])).rows[0]);
    expect(drafting).toMatchObject({ status: "drafting", new_revision_id: next.revision_id });
    expect(drafting.pages).toMatchObject({ new: ["https://help.example.com/instant"], changed: ["https://help.example.com/fees"], removed: 0, unchanged: 1 });
    // One generator call on the reservation path: the run budget is the refresh's, the extended deadline is the generation one.
    const step = await withTenant(scope, async (db) => (await db.query("SELECT * FROM evals.workflow_step WHERE org_id=$1 AND id=$2", [fixture.orgId, drafting.step_id])).rows[0]);
    expect(step).toMatchObject({ status: "queued", step_kind: "generate" });
    expect(step.input).toMatchObject({ role: "generator", refreshJobId: refresh.id, routing: "local_only", providerRevisionId: providerId });
    const prompt = JSON.parse(step.input.messages[1].content);
    const offered = prompt.sources[0].anchors.map((anchor: { excerpt: string }) => anchor.excerpt).join("");
    expect(offered).toContain("7 euros");
    expect(offered).toContain("0.50 euros");
    expect(offered).not.toContain("10,000 euros a day for personal");
    expect(prompt.avoidQuestions).toContain("What daily limit applies to transfers?");
    // The worker's answer: one good question per changed page, one about an unchanged page, one repeat of the set.
    const anchorWith = (text: string) => next.anchors.find((anchor) => anchor.excerpt.includes(text))!;
    const cases = [
      { question: "How much is the monthly account fee now?", expected: "The account fee is 7 euros a month.", keyFacts: ["7 euros a month"], sourceRevisionId: next.revision_id, anchorId: anchorWith("7 euros").id, supportingQuote: "The account fee is 7 euros a month.", severity: "high", difficulty: "routine" },
      { question: "What does an instant transfer cost?", expected: "Instant transfers cost 0.50 euros each.", keyFacts: ["0.50 euros each"], sourceRevisionId: next.revision_id, anchorId: anchorWith("0.50 euros").id, supportingQuote: "Instant transfers cost 0.50 euros each", severity: "medium", difficulty: "routine" },
      { question: "What is the daily transfer limit for personal accounts?", expected: "10,000 euros a day.", keyFacts: ["10,000 euros a day"], sourceRevisionId: next.revision_id, anchorId: anchorWith("10,000 euros").id, supportingQuote: "Transfers are limited to 10,000 euros a day", severity: "high", difficulty: "routine" },
    ];
    await tx(owner, async (db) => {
      const attemptId = randomUUID();
      await db.query("INSERT INTO evals.execution_attempt(id,org_id,step_id,fence,ordinal,provider_revision_id,price_revision_id,status,token_bound) VALUES($1,$2,$3,0,1,$4,$5,'completed',100)", [attemptId, fixture.orgId, step.id, providerId, priceId]);
      const output = { text: JSON.stringify({ cases }), complete: true };
      await db.query("INSERT INTO evals.execution_result(org_id,step_id,attempt_id,output,output_hash) VALUES($1,$2,$3,$4,$5)", [fixture.orgId, step.id, attemptId, output, digest(output)]);
      await db.query("UPDATE evals.workflow_step SET status='completed' WHERE org_id=$1 AND id=$2", [fixture.orgId, step.id]);
    });
    await advanceSourceRefreshes(scheduler);
    const view = await listProposals(scope, fixture.suiteId);
    expect(view.refreshes[0]).toMatchObject({ status: "proposed", proposalCount: 2, pages: { new: 1, changed: 1 } });
    expect(view.proposals.map((item: { question: string }) => item.question).sort()).toEqual(["How much is the monthly account fee now?", "What does an instant transfer cost?"]);
    const [fee, instant] = ["How much", "What does"].map((start) => view.proposals.find((item: { question: string }) => item.question.startsWith(start))!);
    expect(fee).toMatchObject({ changeKind: "changed_page", pageUrl: "https://help.example.com/fees" });
    expect(instant).toMatchObject({ changeKind: "new_page", pageUrl: "https://help.example.com/instant" });
    // Approve one into a new version, reject the other.
    const decided = await decideProposals(scope, fixture.suiteId, { approve: [fee.id], reject: [instant.id] }, randomUUID());
    expect(decided).toMatchObject({ added: 1, rejected: 1, status: "frozen" });
    await withTenant(scope, async (db) => {
      const manifest = (await db.query("SELECT manifest FROM evals.suite_version WHERE org_id=$1 AND id=$2", [fixture.orgId, decided.suiteVersionId])).rows[0].manifest;
      expect(manifest.case_revisions).toHaveLength(2);
      expect(manifest.source_revisions.map((ref: { revision_id: string }) => ref.revision_id)).toEqual([fixture.document.revision_id, next.revision_id]);
      const proposals = (await db.query("SELECT id,status,decided_by,case_revision_id FROM evals.question_proposal WHERE org_id=$1 ORDER BY status", [fixture.orgId])).rows;
      expect(proposals).toEqual([
        { id: fee.id, status: "approved", decided_by: customerId, case_revision_id: expect.any(String) },
        { id: instant.id, status: "rejected", decided_by: customerId, case_revision_id: null },
      ]);
      const added: CefCase = caseSchema.parse((await db.query("SELECT document FROM evals.case_revision WHERE org_id=$1 AND id=$2", [fixture.orgId, proposals[0].case_revision_id])).rows[0].document);
      expect(added.provenance).toMatchObject({ method: "synthetic", generator_revision: providerId, prompt_revision: "monthly-proposals-v1", author_ids: [customerId] });
      expect(added.reference.source_refs).toEqual([{ source_revision_id: next.revision_id, anchor: anchorWith("7 euros").id }]);
      expect(added.extensions["caudals.evals/monthly-proposal"]).toMatchObject({ proposal_id: fee.id, refresh_id: refresh.id, page_url: "https://help.example.com/fees", change_kind: "changed_page", approved_by: customerId });
      expect((await db.query("SELECT count(*)::int AS count FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'question_proposal.%'", [fixture.orgId])).rows[0].count).toBe(2);
    });
    // Decided proposals are immutable and kept.
    await expect(decideProposals(scope, fixture.suiteId, { approve: [instant.id], reject: [] }, randomUUID())).rejects.toMatchObject({ status: 409 });
    await expect(tx(owner, (db) => db.query("UPDATE evals.question_proposal SET status='proposed',decided_by=NULL,decided_at=NULL,case_revision_id=NULL WHERE org_id=$1", [fixture.orgId]))).rejects.toMatchObject({ code: "55000" });
    await expect(tx(owner, (db) => db.query("DELETE FROM evals.question_proposal WHERE org_id=$1", [fixture.orgId]))).rejects.toMatchObject({ code: "55000" });
    // The month is done: no second reading of the same source.
    expect(await advanceSourceRefreshes(scheduler)).toEqual({ started: 0, advanced: 0 });
    expect(await startSourceRefresh(scheduler, fixture.sourceId)).toBe(0);
    expect(code(null)).toBe("");
  });

  it("reads a source again only once a month, and an ops drill can start this month's reading early", async () => {
    const fixture = await workspaceFixture(owner, customerId, [["https://help.example.com/fees", "The account fee is 5 euros a month."]], [{ question: "How much is the account fee?", expected: "5 euros a month.", quote: "5 euros" }]);
    const scheduler = { orgId: fixture.orgId, actorId: "service:evals-scheduler" };
    // Read this month already: the scheduler's pass waits for next month.
    await tx(owner, (db) => db.query("UPDATE evals.website_source_job SET created_at=now() WHERE org_id=$1", [fixture.orgId]));
    await setLibrarySetting({ orgId: fixture.orgId, actorId: customerId }, { monthlyQuestions: true });
    expect(await advanceSourceRefreshes(scheduler)).toMatchObject({ started: 0 });
    // The drill starts it now, once.
    expect(await startSourceRefresh(scheduler, fixture.sourceId)).toBe(1);
    expect(await startSourceRefresh(scheduler, fixture.sourceId)).toBe(0);
    // A reading that never completes closes after a day with a reason.
    await tx(owner, (db) => db.query("UPDATE evals.website_source_job SET status='failed',reason_code='website_capture_unavailable' WHERE org_id=$1 AND status='queued'", [fixture.orgId]));
    await advanceSourceRefreshes(scheduler);
    const refresh = await withTenant({ orgId: fixture.orgId, actorId: customerId }, async (db) => (await db.query("SELECT status,reason_code FROM evals.source_refresh WHERE org_id=$1", [fixture.orgId])).rows[0]);
    expect(refresh).toEqual({ status: "failed", reason_code: "website_capture_unavailable" });
    // Ops can read it again this month: a new website job for the same refresh, the old reason kept.
    expect(await retrySourceRefresh(scheduler, fixture.sourceId)).toBe(1);
    expect(await retrySourceRefresh(scheduler, fixture.sourceId)).toBe(0);
    const retried = await withTenant({ orgId: fixture.orgId, actorId: customerId }, async (db) => (await db.query("SELECT r.status,r.pages,w.status AS job FROM evals.source_refresh r JOIN evals.website_source_job w ON (w.org_id,w.id)=(r.org_id,r.website_job_id) WHERE r.org_id=$1", [fixture.orgId])).rows[0]);
    expect(retried).toEqual({ status: "reading", pages: { retried_after: "website_capture_unavailable" }, job: "queued" });
  });
});

// Keeps the helper used for readable SQL fixtures.
void canonicalJson;
