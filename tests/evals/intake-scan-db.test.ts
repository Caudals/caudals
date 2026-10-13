import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { sha256 } from "../../lib/evals/contracts/hashing";
import { createUpload, finalizeSource, getSource, uploadArtifact } from "../../lib/evals/repositories/evidence";
import { processSourceOne } from "../../services/evals-documents/source-ingestion";
import { createPrefixedId } from "../../lib/operator/ids";
import { mostlyScannedPdf, scannedPdf, textPdf } from "./fixtures/pdf-fixtures";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const documentsUrl = process.env.EVALS_TEST_DOCUMENTS_DATABASE_URL;
const s3 = process.env.EVALS_TEST_S3_ENDPOINT;
const secret = process.env.EVALS_TEST_S3_SECRET ?? "evals_test_password";

/** Launch L-34: the document worker flags a scanned PDF per file, before generation; the other files are unaffected. */
(ownerUrl && documentsUrl && s3 ? describe : describe.skip)("scan flag in the document worker", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); vi.unstubAllEnvs(); });

  it("records page statistics for every PDF, fails a text-less scan with its reason and keeps a mostly scanned file", async () => {
    // The document worker's login also holds the runtime grants in this fixture (scripts/evals/test-db.sh).
    vi.stubEnv("EVALS_DATABASE_URL", documentsUrl!);
    vi.stubEnv("DO_SPACES_ENDPOINT", s3!); vi.stubEnv("DO_SPACES_REGION", "us-east-1"); vi.stubEnv("DO_SPACES_BUCKET", "evals-foundation-test");
    vi.stubEnv("DO_SPACES_ACCESS_KEY_ID", "evals_test"); vi.stubEnv("DO_SPACES_SECRET_ACCESS_KEY", secret); vi.stubEnv("DO_SPACES_FORCE_PATH_STYLE", "true");
    const storage = new S3Client({ endpoint: s3!, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: secret } });
    try { await storage.send(new CreateBucketCommand({ Bucket: "evals-foundation-test" })); }
    catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
    finally { storage.destroy(); }

    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID();
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$1,$2,true)', [actorId, `${actorId}@example.test`]);
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Scan fixture',$2)", [orgId, actorId]);
    await owner.query("SELECT set_config('evals.actor_id',$1,false),set_config('evals.org_id',$2,false)", [actorId, orgId]);
    await owner.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Scan fixture')", [projectId, orgId]);
    await owner.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Scan fixture','source_grounded',5,'EUR')", [evaluationId, orgId, projectId]);
    const scope = { orgId, actorId };
    const add = async (title: string, bytes: Buffer) => {
      const created = await createUpload(scope, { projectId, evaluationId, title, mediaType: "application/pdf", byteSize: bytes.length, sha256: sha256(bytes), rights: "customer_owned" }, randomUUID(), { intakeV2: true }) as { sourceId: string; artifactId: string };
      await uploadArtifact(scope, created.artifactId, bytes);
      await finalizeSource(scope, created.sourceId, randomUUID());
      return created.sourceId;
    };
    const text = await add("policy.pdf", textPdf());
    const scan = await add("scan.pdf", scannedPdf());
    const mixed = await add("mixed.pdf", mostlyScannedPdf());
    for (let index = 0; index < 3; index++) expect(await processSourceOne(orgId, actorId)).toBe(true);
    const ingestion = async (id: string) => (await getSource(scope, id)).ingestion as Record<string, unknown>;
    expect(await ingestion(text)).toMatchObject({ status: "completed", scan_suspected: false, page_count: 3, empty_pages: 0 });
    expect(await ingestion(scan)).toMatchObject({ status: "failed", reason_code: "pdf_scanned", scan_suspected: true, page_count: 4, empty_pages: 4, text_chars: 0 });
    expect(await ingestion(mixed)).toMatchObject({ status: "completed", scan_suspected: true, page_count: 4, empty_pages: 3 });
    // The text PDF is ready for generation whatever happened to the others.
    expect((await getSource(scope, text)).revisions).toHaveLength(1);
  });
});
