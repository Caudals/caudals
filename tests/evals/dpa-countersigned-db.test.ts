/**
 * Countersigned DPA copies (launch L-32, the L-30 follow-up of spec P-42) on
 * the real schema (migration 108) and object storage: Caudals operations
 * attach a PDF to a workspace's DPA acceptance; owners download only their
 * own workspace's copy; nobody else can read, write or change the record;
 * attach, download and removal are audited.
 */
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { CreateBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { createPrefixedId } from "@/lib/operator/ids";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;
const endpoint = process.env.EVALS_TEST_S3_ENDPOINT;
const BUCKET = "evals-dpa-countersigned-test";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

describe.skipIf(!ownerUrl || !runtimeUrl || !endpoint)("countersigned DPA copies (launch L-32)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "evals_test", secretAccessKey: "evals_test_password" } });
  const exists = (key: string) => s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(() => true, () => false);
  const jsonHeaders = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATA_CONTROLS_ENABLED", "true");
    for (const [name, value] of Object.entries({ DO_SPACES_ENDPOINT: endpoint!, DO_SPACES_REGION: "us-east-1", DO_SPACES_BUCKET: BUCKET, DO_SPACES_ACCESS_KEY_ID: "evals_test", DO_SPACES_SECRET_ACCESS_KEY: "evals_test_password", DO_SPACES_FORCE_PATH_STYLE: "true" })) vi.stubEnv(name, value);
    try { await s3.send(new CreateBucketCommand({ Bucket: BUCKET })); } catch (error) { if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((error as Error).name)) throw error; }
  });
  afterAll(async () => {
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await owner.end();
    await getEvalsPool().end();
    s3.destroy();
    vi.unstubAllEnvs();
  });

  async function asOwner<T>(work: (db: PoolClient) => Promise<T>, actorId: string, orgId = "") {
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  async function person(name: string, platformRole?: "operator" | "platform_admin"): Promise<EvalIdentity> {
    const id = createPrefixedId("au");
    const email = `${randomUUID()}@example.test`;
    await asOwner(async (db) => {
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, email]);
      if (platformRole) await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, platformRole]);
    }, id);
    return { user: { id, email, name }, platformRole: platformRole ?? null, workspaces: [] };
  }
  async function workspace(members: Array<[EvalIdentity, "owner" | "editor" | "viewer"]>) {
    const orgId = randomUUID();
    await asOwner(async (db) => {
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'DPA fixture',$2)", [orgId, members[0][0].user.id]);
      for (const [member, role] of members) {
        await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, member.user.id, role]);
        member.workspaces.push({ id: orgId, name: "DPA fixture", role });
      }
    }, members[0][0].user.id, orgId);
    return orgId;
  }

  it("lets operations attach and remove, owners download their own, and audits each step", async () => {
    const { acceptDpa, getDpaStatus } = await import("@/lib/legal/dpa");
    const { attachCountersigned, openCountersigned, removeCountersigned } = await import("@/lib/legal/dpa-countersigned");
    const { withTenant } = await import("@/lib/evals/repositories/db");
    const { legalDocumentVersion } = await import("@/lib/legal/versions");
    const customer = await person("Owner One");
    const editor = await person("Editor One");
    const otherOwner = await person("Owner Two");
    const ops = await person("Ops", "operator");
    const orgId = await workspace([[customer, "owner"], [editor, "editor"]]);
    const otherOrg = await workspace([[otherOwner, "owner"]]);
    const accepted = await acceptDpa(customer, orgId, { version: legalDocumentVersion("dpa"), locale: "en", requestId: randomUUID() });
    const acceptanceId = accepted.acceptance!.id;
    const otherAccepted = await acceptDpa(otherOwner, otherOrg, { version: legalDocumentVersion("dpa"), locale: "es", requestId: randomUUID() });

    // Customers never attach: not in the application, not in the database.
    await expect(attachCountersigned(customer, orgId, { acceptanceId, fileName: "signed.pdf", bytes: PDF })).rejects.toMatchObject({ code: "OPERATOR_REQUIRED", status: 403 });
    await expect(withTenant({ orgId, actorId: customer.user.id }, (db) => db.query("SELECT evals.attach_dpa_countersigned($1,$2,$3,$4,$5,$6)", [orgId, acceptanceId, `evals/${orgId}/x/sealed/y`, "b".repeat(64), 10, "x.pdf"]))).rejects.toThrow("OPERATOR_REQUIRED");
    await expect(withTenant({ orgId, actorId: ops.user.id }, (db) => db.query("INSERT INTO evals.dpa_countersigned(org_id,acceptance_id,version,object_key,sha256,byte_size,file_name,uploaded_by) VALUES($1,$2,'v',$3,$4,1,'x.pdf','x')", [orgId, acceptanceId, randomUUID(), "c".repeat(64)]))).rejects.toMatchObject({ code: "42501" });
    // Only PDFs, and only to an acceptance of the same workspace.
    await expect(attachCountersigned(ops, orgId, { acceptanceId, fileName: "signed.docx", bytes: Buffer.from("PK\u0003\u0004 not a pdf") })).rejects.toMatchObject({ status: 415 });
    await expect(attachCountersigned(ops, orgId, { acceptanceId: otherAccepted.acceptance!.id, fileName: "signed.pdf", bytes: PDF })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    // Operations attach through the API (raw PDF body), once per acceptance.
    const route = await import("@/app/api/evals/v1/workspaces/[id]/dpa/countersigned/route");
    const upload = (who: EvalIdentity, body: Buffer = PDF) => {
      identity.current = who;
      return route.POST(new Request(`http://localhost/api/evals/v1/workspaces/${orgId}/dpa/countersigned?acceptanceId=${acceptanceId}&fileName=${encodeURIComponent("Caudals DPA signed.pdf")}`, {
        method: "POST", headers: { host: "localhost", origin: "http://localhost", "content-type": "application/pdf" }, body: new Uint8Array(body),
      }));
    };
    // A platform operator without a membership cannot open the workspace; the platform admin can (audited support access).
    expect((await upload(ops)).status).toBe(404);
    const admin = await person("Platform admin", "platform_admin");
    const attachedResponse = await upload(admin);
    expect(attachedResponse.status).toBe(200);
    const attached = (await attachedResponse.json()).data;
    expect(attached).toMatchObject({ acceptanceId, version: legalDocumentVersion("dpa"), fileName: "Caudals DPA signed.pdf", byteSize: PDF.length });
    expect((await upload(admin)).status).toBe(409);
    // A platform operator with access (as for a managed customer) attaches too; the live copy is unique.
    await asOwner((db) => db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, ops.user.id]), ops.user.id, orgId);
    await expect(attachCountersigned(ops, orgId, { acceptanceId, fileName: "again.pdf", bytes: PDF })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    // Owners see and download it; editors and other workspaces see nothing.
    expect((await getDpaStatus(customer, orgId)).countersigned).toMatchObject({ id: attached.id, fileName: "Caudals DPA signed.pdf" });
    expect((await getDpaStatus(customer, orgId)).canAttach).toBe(false);
    expect((await getDpaStatus(admin, orgId)).canAttach).toBe(true);
    expect((await getDpaStatus(editor, orgId)).countersigned).toBeNull();
    expect((await getDpaStatus(otherOwner, otherOrg)).countersigned).toBeNull();
    const download = await import("@/app/api/evals/v1/workspaces/[id]/dpa/countersigned/[attachmentId]/route");
    const get = (who: EvalIdentity, org = orgId) => {
      identity.current = who;
      return download.GET(new Request(`http://localhost/api/evals/v1/workspaces/${org}/dpa/countersigned/${attached.id}`, { headers: jsonHeaders }));
    };
    const ok = await get(customer);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await ok.arrayBuffer()).equals(PDF)).toBe(true);
    expect((await get(editor)).status).toBe(404);
    expect((await get(otherOwner)).status).toBe(404);
    expect((await get(otherOwner, otherOrg)).status).toBe(404);
    await expect(openCountersigned(otherOwner, otherOrg, attached.id)).rejects.toMatchObject({ status: 404 });

    // The record cannot be changed or deleted, even by the table owner.
    await expect(owner.query("UPDATE evals.dpa_countersigned SET file_name='renamed.pdf' WHERE id=$1", [attached.id])).rejects.toMatchObject({ code: "55000" });
    await expect(owner.query("DELETE FROM evals.dpa_countersigned WHERE id=$1", [attached.id])).rejects.toMatchObject({ code: "55000" });

    // Removal: operations only, with a reason; the file goes, the record stays.
    const key = (await owner.query("SELECT object_key FROM evals.dpa_countersigned WHERE id=$1", [attached.id])).rows[0].object_key;
    expect(await exists(key)).toBe(true);
    await expect(removeCountersigned(customer, orgId, attached.id, "Wrong file")).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" });
    identity.current = ops;
    const removed = await download.DELETE(new Request(`http://localhost/api/evals/v1/workspaces/${orgId}/dpa/countersigned/${attached.id}`, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ reason: "Uploaded the unsigned draft" }) }));
    expect(removed.status).toBe(200);
    expect(await exists(key)).toBe(false);
    expect((await owner.query("SELECT removed_at IS NOT NULL AS removed,removed_by,removal_reason FROM evals.dpa_countersigned WHERE id=$1", [attached.id])).rows[0]).toEqual({ removed: true, removed_by: ops.user.id, removal_reason: "Uploaded the unsigned draft" });
    expect((await getDpaStatus(customer, orgId)).countersigned).toBeNull();
    expect((await get(customer)).status).toBe(404);
    // A corrected copy can then be attached.
    expect(await attachCountersigned(ops, orgId, { acceptanceId, fileName: "signed-final.pdf", bytes: PDF })).toMatchObject({ fileName: "signed-final.pdf" });

    const audit = (await owner.query("SELECT action,actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action LIKE 'legal.dpa_countersigned%' ORDER BY created_at,id", [orgId])).rows;
    expect(audit.map((row) => [row.action, row.actor_id])).toEqual([
      ["legal.dpa_countersigned_attached", admin.user.id],
      ["legal.dpa_countersigned_downloaded", customer.user.id],
      ["legal.dpa_countersigned_removed", ops.user.id],
      ["legal.dpa_countersigned_attached", ops.user.id],
    ]);
    expect(audit[0].details).toMatchObject({ acceptance_id: acceptanceId, version: legalDocumentVersion("dpa"), byte_size: PDF.length, file_name: "Caudals DPA signed.pdf", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(audit[2].details).toMatchObject({ reason: "Uploaded the unsigned draft" });

    // Off by default: the routes answer 404 and the status carries no copy.
    vi.stubEnv("DATA_CONTROLS_ENABLED", "false");
    expect((await get(customer)).status).toBe(404);
    expect((await getDpaStatus(customer, orgId)).countersigned).toBeUndefined();
    vi.stubEnv("DATA_CONTROLS_ENABLED", "true");
  }, 60_000);
});
