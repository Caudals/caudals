import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import {
  createExpertAssignment,
  createExpertProfile,
  createGuidelineRevision,
  createPaymentRecord,
  listAssignedWork,
  listPaymentRecords,
  readAssignedWork,
  recordQualityDecision,
  revealReviewPhase,
  saveExpertSubmission,
} from "../../lib/evals/experts/store";

const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const ownerUrl = process.env.EVALS_TEST_OWNER_URL;

(runtimeUrl && ownerUrl ? describe : describe.skip)("WP-14 expert PostgreSQL path", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  const operatorId = `operator-${randomUUID()}`;
  const expertAUserId = `expert-a-${randomUUID()}`;
  const expertBUserId = `expert-b-${randomUUID()}`;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  let profileA: { id: string };
  let profileB: { id: string };
  let guidelineA: { revisionId: string };

  beforeAll(async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      for (const [id, email] of [
        [operatorId, `${randomUUID()}@example.test`],
        [expertAUserId, `${randomUUID()}@example.test`],
        [expertBUserId, `${randomUUID()}@example.test`],
      ]) {
        await client.query(
          `INSERT INTO public.auth_user(id,name,email,"emailVerified","createdAt","updatedAt")
           VALUES($1,$1,$2,true,now(),now())`,
          [id, email],
        );
      }
      await client.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [operatorId]);
      await client.query(
        "INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Expert A workspace',$3),($2,'Expert B workspace',$3)",
        [orgA, orgB, operatorId],
      );
      await client.query(
        "INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$3,'operator'),($2,$3,'operator')",
        [orgA, orgB, operatorId],
      );
      await client.query(
        "INSERT INTO evals.project(id,org_id,title,created_by) VALUES($1,$2,'Project A',$5),($3,$4,'Project B',$5)",
        [projectA, orgA, projectB, orgB, operatorId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    profileA = await createExpertProfile(operatorId, {
      userId: expertAUserId,
      domains: ["insurance"],
      jurisdictions: ["ES"],
      languages: ["es-ES"],
      credentialsStatus: "verified",
      termsStatus: "accepted",
      eligibilityStatus: "eligible",
    });
    profileB = await createExpertProfile(operatorId, {
      userId: expertBUserId,
      domains: ["insurance"],
      jurisdictions: ["ES"],
      languages: ["es-ES"],
      credentialsStatus: "verified",
      termsStatus: "accepted",
      eligibilityStatus: "eligible",
    });
    guidelineA = await createGuidelineRevision(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        title: "Insurance answer review",
        instructions: "Use only the redacted policy excerpt.",
        criteria: [{ id: "grounding", description: "Every claim is supported.", required: true }],
        supersedesRevisionId: null,
      },
    );
  });

  afterAll(async () => {
    await owner.end();
    await getEvalsPool().end();
  });

  it("isolates assigned evidence and preserves both sides of an autosave conflict", async () => {
    const assignmentA = await createExpertAssignment(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        kind: "authoring",
        expertProfileId: profileA.id,
        guidelineRevisionId: guidelineA.revisionId,
        severity: "high",
        evidenceSnapshot: { excerpts: [{ anchor: "policy-1", text: "A claim must be filed within 30 days." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: null,
      },
    );
    const assignmentB = await createExpertAssignment(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        kind: "authoring",
        expertProfileId: profileB.id,
        guidelineRevisionId: guidelineA.revisionId,
        severity: "medium",
        evidenceSnapshot: { excerpts: [{ anchor: "policy-2", text: "A different redacted excerpt." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: null,
      },
    );
    const actorA = { userId: expertAUserId, profileId: profileA.id };
    const document = { answer: "File within 30 days.", rationale: "The supplied policy states 30 days.", source_refs: [], flags: [] };
    const first = await saveExpertSubmission(actorA, assignmentA.id, { expectedVersion: 0, document });
    const stale = await saveExpertSubmission(actorA, assignmentA.id, {
      expectedVersion: 0,
      document: { ...document, answer: "Competing independent draft." },
    });
    expect(first).toMatchObject({ conflict: false, version: 1, lockVersion: 1 });
    expect(stale).toMatchObject({ conflict: true, version: 2, lockVersion: 1 });
    expect((await owner.query(
      "SELECT count(*)::int AS count FROM evals.expert_submission_revision WHERE assignment_id=$1",
      [assignmentA.id],
    )).rows[0].count).toBe(2);
    await expect(readAssignedWork(actorA, assignmentB.id)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    expect((await listAssignedWork(actorA)).map((row) => row.id)).toContain(assignmentA.id);
    expect((await listAssignedWork(actorA)).map((row) => row.id)).not.toContain(assignmentB.id);
  });

  it("keeps independent review blind, rejects self-review, and permits attributed critical approval", async () => {
    const authoring = await createExpertAssignment(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        kind: "authoring",
        expertProfileId: profileA.id,
        guidelineRevisionId: guidelineA.revisionId,
        severity: "critical",
        evidenceSnapshot: { excerpts: [{ anchor: "critical-1", text: "Critical redacted policy." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: null,
      },
    );
    const submitted = await saveExpertSubmission(
      { userId: expertAUserId, profileId: profileA.id },
      authoring.id,
      {
        expectedVersion: 0,
        submit: true,
        document: { answer: "Reviewed answer", rationale: "Grounded in the excerpt.", source_refs: [], flags: [] },
      },
    );
    await expect(createExpertAssignment(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        kind: "independent_review",
        expertProfileId: profileA.id,
        guidelineRevisionId: guidelineA.revisionId,
        severity: "critical",
        evidenceSnapshot: { excerpts: [{ anchor: "critical-1", text: "Critical redacted policy." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: submitted.revisionId,
      },
    )).rejects.toMatchObject({ code: "INPUT_INVALID" });

    const review = await createExpertAssignment(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        kind: "independent_review",
        expertProfileId: profileB.id,
        guidelineRevisionId: guidelineA.revisionId,
        severity: "critical",
        evidenceSnapshot: { excerpts: [{ anchor: "critical-1", text: "Critical redacted policy." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: submitted.revisionId,
      },
    );
    const actorB = { userId: expertBUserId, profileId: profileB.id };
    const blind = await readAssignedWork(actorB, review.id);
    expect(blind).not.toHaveProperty("peerDecisions");
    expect(JSON.stringify(blind)).not.toContain(expertAUserId);
    await recordQualityDecision(actorB, review.id, { decision: "approve", rationale: "The answer is supported." });
    await revealReviewPhase({ orgId: orgA, actorId: operatorId }, review.id);
    expect(await readAssignedWork(actorB, review.id)).toMatchObject({
      peerDecisions: [{ decision: "approve", rationale: "The answer is supported." }],
    });
  });

  it("flags unfinished assignments after a guideline revision and hides payment data from experts", async () => {
    const assignment = await createExpertAssignment(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        kind: "calibration",
        expertProfileId: profileA.id,
        guidelineRevisionId: guidelineA.revisionId,
        severity: "medium",
        evidenceSnapshot: { excerpts: [{ anchor: "gold-1", text: "Synthetic gold evidence." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: null,
      },
    );
    const replacement = await createGuidelineRevision(
      { orgId: orgA, actorId: operatorId },
      {
        projectId: projectA,
        title: "Insurance answer review v2",
        instructions: "Use only evidence and flag ambiguity.",
        criteria: [{ id: "grounding", description: "Every claim is supported.", required: true }],
        supersedesRevisionId: guidelineA.revisionId,
      },
    );
    expect(replacement.revisionId).not.toBe(guidelineA.revisionId);
    expect(await readAssignedWork({ userId: expertAUserId, profileId: profileA.id }, assignment.id)).toMatchObject({ status: "guideline_changed" });
    await createPaymentRecord(
      { orgId: orgA, actorId: operatorId },
      { assignmentId: assignment.id, amount: "75.00", currency: "EUR", status: "planned", note: "Manual invoice after acceptance." },
    );
    expect(await listPaymentRecords({ orgId: orgA, actorId: operatorId }, assignment.id)).toHaveLength(1);
    expect(JSON.stringify(await readAssignedWork({ userId: expertAUserId, profileId: profileA.id }, assignment.id))).not.toContain("75.00");
  });

  it("does not expose another tenant's assignments through guessed IDs", async () => {
    const guidelineB = await createGuidelineRevision(
      { orgId: orgB, actorId: operatorId },
      {
        projectId: projectB,
        title: "Other tenant guideline",
        instructions: "Private to the other tenant.",
        criteria: [{ id: "quality", description: "Check quality.", required: true }],
        supersedesRevisionId: null,
      },
    );
    const other = await createExpertAssignment(
      { orgId: orgB, actorId: operatorId },
      {
        projectId: projectB,
        kind: "authoring",
        expertProfileId: profileB.id,
        guidelineRevisionId: guidelineB.revisionId,
        severity: "low",
        evidenceSnapshot: { excerpts: [{ anchor: "other", text: "Other tenant evidence." }], transcript: [] },
        conflictDeclaration: "clear",
        dueAt: null,
        reviewOfSubmissionRevisionId: null,
      },
    );
    await expect(readAssignedWork({ userId: expertAUserId, profileId: profileA.id }, other.id)).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
  });
});
