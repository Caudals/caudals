import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { CreateBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { getDeletionRequest, requestWorkspaceDeletion, tickLifecycle } from "../../lib/evals/operations/lifecycle";
import { objectKey, writeUpload } from "../../lib/evals/storage/private";
import { requireWorkspace, type EvalIdentity } from "../../lib/evals/domain/identity";
import { sha256 } from "../../lib/evals/contracts/hashing";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const endpoint = process.env.EVALS_TEST_S3_ENDPOINT;

(ownerUrl && runtimeUrl && endpoint ? describe : describe.skip)("retention and workspace deletion on PostgreSQL and object storage", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); vi.unstubAllEnvs(); });

  it("deletes expired objects, then runs a requested workspace deletion to a tombstone", async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint!, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: "evals-lifecycle-test", DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
    const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
    try { await s3.send(new CreateBucketCommand({ Bucket: "evals-lifecycle-test" })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
    const exists = async (key: string) => s3.send(new HeadObjectCommand({ Bucket: "evals-lifecycle-test", Key: key })).then(() => true, () => false);

    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID();
    const expiredId = randomUUID(), liveId = randomUUID(), secretId = randomUUID();
    const expiredKey = objectKey(orgId, expiredId), liveKey = objectKey(orgId, liveId);
    const bytes = Buffer.from("Synthetic lifecycle evidence.");
    await writeUpload(expiredKey, bytes, "text/plain");
    await writeUpload(liveKey, bytes, "text/plain");
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Lifecycle fixture", `${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Lifecycle fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Lifecycle')", [projectId, orgId]);
      for (const [id, key, expires] of [[expiredId, expiredKey, "now()-interval '1 day'"], [liveId, liveKey, "now()+interval '90 days'"]]) {
        await db.query(`INSERT INTO evals.artifact(id,org_id,project_id,object_key,sha256,byte_size,media_type,export_path,visibility,state,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,'text/plain',$7,'internal','pending',${expires})`, [id, orgId, projectId, key, sha256(bytes), bytes.length, `sources/${id}.txt`]);
      }
      await db.query("INSERT INTO evals.secret_record(id,org_id,purpose,scope_id,created_by) VALUES($1,$2,'target',$3,$4)", [secretId, orgId, randomUUID(), actorId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const first = await tickLifecycle("service:lifecycle-test");
    expect(first).toMatchObject({ deleted: 1, failed: 0 });
    expect(await exists(expiredKey)).toBe(false);
    expect(await exists(liveKey)).toBe(true);
    const states = (await owner.query("SELECT id,state FROM evals.artifact WHERE org_id=$1 ORDER BY id", [orgId])).rows;
    expect(Object.fromEntries(states.map((row) => [row.id, row.state]))).toEqual({ [expiredId]: "deleted", [liveId]: "pending" });

    const identity: EvalIdentity = { user: { id: actorId, email: "o@example.test", name: "Owner" }, platformRole: null, workspaces: [{ id: orgId, name: "Lifecycle fixture", role: "owner" }] };
    const request = await requestWorkspaceDeletion({ orgId, actorId }, "Customer asked us to delete all evaluation data");
    expect((await requestWorkspaceDeletion({ orgId, actorId }, "Duplicate request")).id).toBe(request.id);
    expect((await owner.query("SELECT revoked_at IS NOT NULL AS revoked FROM evals.secret_record WHERE id=$1", [secretId])).rows[0].revoked).toBe(true);

    await tickLifecycle("service:lifecycle-test");
    expect(await exists(liveKey)).toBe(false);
    const status = await getDeletionRequest({ orgId, actorId });
    expect(status).toMatchObject({ status: "completed", summary: expect.objectContaining({ objects_remaining: 0, credentials_revoked: 0 }) });
    expect((await owner.query("SELECT deleted_at IS NOT NULL AS deleted FROM evals.workspace WHERE id=$1", [orgId])).rows[0].deleted).toBe(true);
    const ledger = (await owner.query("SELECT action FROM evals.recovery_control_event WHERE org_id=$1 ORDER BY id", [orgId])).rows.map((row) => row.action);
    expect(ledger).toEqual(["artifact_deleted", "artifact_deleted", "workspace_deleted"]);
    await expect(requireWorkspace(identity, orgId, "read")).rejects.toMatchObject({ status: 404 });
    s3.destroy();
  }, 30000);
});
