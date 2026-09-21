# Stage E Expert Data Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver WP-14 and WP-15 end to end: assignment-scoped expert work and independent QA, followed by rights-checked, family-safe, signed improvement-dataset releases with held-out follow-up evidence.

**Architecture:** Add two additive migrations and two focused domains under `lib/evals`: `experts` owns eligibility, redacted assignments, append-only autosaves, blind review, adjudication, quality metrics, conflicts, and manual payment records; `improvements` owns finding lineage, dataset-item revisions, release manifests/artifacts, contamination checks, and intervention validation. Expert access is derived from the signed-in Better Auth user and the assigned expert profile rather than workspace membership; operators continue to use tenant-scoped `withTenant` transactions. UI work composes only from the platform primitives and is verified through the isolated Playwright harness.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, PostgreSQL 16 RLS, Node `crypto` Ed25519, private S3-compatible storage, Vitest, Playwright.

**Spec:** `docs/product-specs/evals-platform-implementation-spec.md` (Stage E, WP-14 and WP-15)

## Global Constraints

- Never use subagents or delegate work outside this primary session.
- Preserve marketing, `/admin`, Leads CRM, frozen legacy modules, and invite-only evaluation behavior.
- Enforce tenant and assignment scope server-side; experts receive only immutable redacted evidence snapshots needed for their assigned work.
- Model output cannot authorize access, spend, publication, tools, network destinations, or release membership.
- All submitted work, QA decisions, dataset revisions, releases, and validation snapshots are append-only; corrections create attributed new records.
- An author cannot independently approve their own work; every critical item requires a different qualified reviewer.
- Reviewers remain blind to model identity, author identity, and other reviewers' decisions until an operator explicitly reveals the review phase.
- Rights, provenance, redaction, required review, family split, and contamination checks must all pass before release.
- Training items and sibling variants from the same family cannot support untouched-holdout claims.
- UI uses `components/evals/primitives.tsx`, `packages/brand/platform.css`, Lucide icons, English catalog strings, and no inline visual values.
- Migrations are additive and serialized; rollback files refuse destructive reversal and direct operators to disable Stage E and forward-repair.
- Deployment remains feature-gated until migrations, signing material, backup evidence, and the Stage E release check pass.

## Review Focus

- A signed-in expert guesses another expert's assignment, workspace, case, source, or artifact ID: every request must return the same non-enumerating denial and disclose no metadata. Covered in Task 2 database/API tests.
- Two browser tabs autosave from the same base version: both contributions must remain append-only and the stale write must create an explicit conflict rather than overwrite. Covered in Task 2 database tests and Task 3 UI tests.
- The author is later assigned as reviewer, or a critical item has only a self-review: database and domain gates must reject approval and release. Covered in Tasks 2 and 4.
- A training item and a held-out sibling use different item IDs but the same family ID, including overlap with an earlier release: release must fail before artifact creation. Covered in Tasks 4 and 5.
- A released artifact is truncated, reordered, altered, signed by the wrong key, or parsed with an unknown schema major: round-trip verification must fail closed. Covered in Tasks 4 and 5.

---

### Task 1: Expert contracts, blind projections, and quality metrics

**Files:**
- Create: `lib/evals/experts/contracts.ts`
- Create: `lib/evals/experts/quality.ts`
- Create: `tests/evals/stage-e-experts.test.ts`

**Interfaces:**
- Consumes: existing UUID/timestamp primitives and canonical hashing from `lib/evals/contracts`.
- Produces: `expertProfileInputSchema`, `expertGuidelineSchema`, `expertAssignmentInputSchema`, `expertSubmissionDocumentSchema`, `qualityDecisionSchema`, `redactedAssignmentProjection`, `computeExpertQualityMetrics`.

- [ ] **Step 1: Write failing contract and quality tests**

```ts
import { describe, expect, it } from "vitest";
import {
  expertAssignmentInputSchema,
  qualityDecisionSchema,
  redactedAssignmentProjection,
} from "../../lib/evals/experts/contracts";
import { computeExpertQualityMetrics } from "../../lib/evals/experts/quality";

describe("WP-14 expert contracts", () => {
  it("projects only redacted evidence and hides identities and peer decisions", () => {
    const projected = redactedAssignmentProjection({
      id: "00000000-0000-4000-8000-000000000101",
      kind: "independent_review",
      evidence_snapshot: { excerpts: [{ anchor: "p1", text: "Redacted policy" }] },
      model_identity: "private-model",
      author_identity: "private-author",
      peer_decisions: [{ decision: "approve" }],
      review_phase: "blind",
    });
    expect(projected).toMatchObject({ evidence: { excerpts: [{ anchor: "p1", text: "Redacted policy" }] } });
    expect(JSON.stringify(projected)).not.toMatch(/private-model|private-author|peer_decisions/);
  });

  it("requires a declared conflict state and bounded immutable evidence", () => {
    expect(expertAssignmentInputSchema.safeParse({ kind: "authoring", evidence: {}, conflictDeclaration: "clear" }).success).toBe(false);
  });

  it("does not rank a small calibration sample", () => {
    expect(computeExpertQualityMetrics([{ gold: true, correct: true }])).toEqual(expect.objectContaining({ count: 1, reliable: false, score: null }));
  });

  it("requires an independent reviewer for approval", () => {
    expect(() => qualityDecisionSchema.parse({ decision: "approve", authorProfileId: "same", reviewerProfileId: "same", severity: "critical" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx vitest run tests/evals/stage-e-experts.test.ts`

Expected: FAIL because `lib/evals/experts/contracts.ts` and `quality.ts` do not exist.

- [ ] **Step 3: Implement strict schemas and pure policy functions**

```ts
export const expertAssignmentKinds = ["authoring", "independent_review", "adjudication", "calibration"] as const;
export const conflictDeclarationSchema = z.enum(["clear", "disclosed"]);
export const expertProfileInputSchema = z.strictObject({
  userId: z.string().min(1).max(200),
  domains: z.array(z.string().min(1).max(120)).min(1).max(30),
  jurisdictions: z.array(z.string().min(1).max(120)).max(30),
  languages: z.array(z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)).min(1).max(20),
  credentialsStatus: z.enum(["pending", "verified", "rejected"]),
  termsStatus: z.enum(["pending", "accepted", "expired"]),
  eligibilityStatus: z.enum(["inactive", "calibrating", "eligible", "suspended"]),
});
export const expertSubmissionDocumentSchema = z.strictObject({
  answer: z.unknown(),
  rationale: z.string().trim().min(1).max(12_000),
  source_refs: z.array(z.strictObject({ source_revision_id: z.uuid(), anchor: z.string().min(1).max(500) })).max(100),
  flags: z.array(z.enum(["ambiguous", "missing_source", "guideline_question"])).max(20),
});

export function computeExpertQualityMetrics(rows: readonly CalibrationResult[]) {
  const count = rows.length;
  const correct = rows.filter((row) => row.gold && row.correct).length;
  return { count, reliable: count >= 10, score: count >= 10 ? correct / count : null };
}
```

The redacted projection must return only assignment ID/kind/status, guideline content, due date, redacted evidence, the current expert's own revision, and—only after `review_phase === "revealed"`—anonymized peer decisions. It must never include workspace IDs, raw source/artifact IDs not present in the snapshot, model identity, author identity, payment data, or other experts' draft content.

- [ ] **Step 4: Run focused and existing contract tests**

Run: `npx vitest run tests/evals/stage-e-experts.test.ts tests/evals/contracts.test.ts`

Expected: PASS with all WP-14 contract cases and existing CEF contracts green.

- [ ] **Step 5: Commit**

```bash
git add lib/evals/experts/contracts.ts lib/evals/experts/quality.ts tests/evals/stage-e-experts.test.ts
git commit -m "feat(evals): define expert work contracts"
```

### Task 2: Expert persistence, assignment-scoped authorization, and APIs

**Files:**
- Create: `db/migrations/043_evals_expert_work.sql`
- Create: `db/rollbacks/043_evals_expert_work_down.sql`
- Modify: `scripts/evals/migrate.ts`
- Create: `lib/evals/experts/store.ts`
- Create: `lib/evals/domain/expert-identity.ts`
- Create: `lib/evals/domain/features.ts`
- Modify: `lib/evals/domain/routing.ts`
- Create: `app/api/evals/v1/experts/route.ts`
- Create: `app/api/evals/v1/expert-assignments/route.ts`
- Create: `app/api/evals/v1/expert-assignments/[id]/route.ts`
- Create: `app/api/evals/v1/review/assignments/route.ts`
- Create: `app/api/evals/v1/review/assignments/[id]/route.ts`
- Create: `app/api/evals/v1/review/assignments/[id]/quality/route.ts`
- Create: `tests/evals/stage-e-expert-db.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas, `withTenant`, `api`, `requireIdentity`, `requireWorkspace`, immutable artifact/case/source IDs.
- Produces: append-only expert tables, `requireStageEEnabled`, `requireExpertProfile`, `createExpertProfile`, `createGuidelineRevision`, `createExpertAssignment`, `listAssignedWork`, `readAssignedWork`, `saveExpertSubmission`, `submitExpertWork`, `recordQualityDecision`, `revealReviewPhase`.

- [ ] **Step 1: Write the failing database integration test**

The test provisions two experts and two workspaces in a disposable PostgreSQL 16 database, then proves assignment isolation, append-only conflict preservation, blind review, guideline invalidation, self-review rejection, independent critical review, and manual payment visibility.

```ts
const first = await saveExpertSubmission(expertA, assignmentA, { expectedVersion: 0, document });
const stale = await saveExpertSubmission(expertA, assignmentA, { expectedVersion: 0, document: competing });
expect(first).toMatchObject({ conflict: false, version: 1 });
expect(stale).toMatchObject({ conflict: true });
expect(await revisionCount(owner, assignmentA)).toBe(2);
await expect(readAssignedWork(expertA, assignmentB)).rejects.toThrow("SCOPE_DENIED");
await expect(recordQualityDecision(expertA, selfReviewAssignment, { decision: "approve" })).rejects.toThrow("INDEPENDENT_REVIEW_REQUIRED");
```

- [ ] **Step 2: Run the database test and verify RED**

Run: `EVALS_TEST_DATABASE_URL="$EVALS_TEST_DATABASE_URL" EVALS_TEST_OWNER_URL="$EVALS_TEST_OWNER_URL" npx vitest run tests/evals/stage-e-expert-db.test.ts`

Expected: FAIL because migration 043 and the expert store do not exist.

- [ ] **Step 3: Add the additive expert schema and RLS**

Migration 043 creates:

```sql
evals.expert_profile
evals.expert_guideline_revision
evals.expert_assignment
evals.expert_assignment_evidence
evals.expert_conflict_declaration
evals.expert_submission_revision
evals.expert_quality_review
evals.expert_payment_record
```

`expert_profile` is platform-managed and self-readable. Every work record includes `org_id`. Assignment policies allow tenant operators through the existing transaction-local tenant context and allow exactly the assigned profile's authenticated `user_id`; evidence is stored as an immutable redacted JSON snapshot, never as a broad source permission. Submission revisions and quality reviews use the existing immutable trigger. A database trigger rejects any quality review where reviewer and author profiles match, and rejects a critical approval without a distinct submitted review assignment. Global profile management is limited to verified platform operators through a `SECURITY DEFINER` function with a fixed search path.

- [ ] **Step 4: Implement store transactions and optimistic autosave**

```ts
export async function saveExpertSubmission(
  actor: ExpertActor,
  assignmentId: string,
  input: { expectedVersion: number; document: ExpertSubmissionDocument; submit?: boolean },
): Promise<{ revisionId: string; version: number; conflict: boolean }>;
```

The transaction locks the assignment, verifies the assigned profile and a `clear` conflict declaration, inserts a new immutable revision for every save, and advances `lock_version` only when `expectedVersion` matches. A stale save is inserted with `conflict=true`, leaves the current pointer unchanged, moves the assignment to `conflict`, and returns both revision IDs without throwing so the preservation insert commits. Guideline supersession marks unfinished assignments `guideline_changed`; it never rewrites submitted work.

- [ ] **Step 5: Add bounded API routes**

Operator endpoints require a platform role plus `requireWorkspace(..., "manage")` for tenant assignments. Expert endpoints call `requireExpertProfile(identity.user.id)` and never accept `orgId` as authority; the assignment row determines tenant scope. Mutations use strict Zod bodies, bounded text/array limits, same-origin enforcement from `api`, and UUID idempotency keys for creation. Unknown and unauthorized IDs both return `SCOPE_DENIED`/404.

Every Stage E API begins with `requireStageEEnabled()`, which fails as a non-enumerating 404 unless `EVALS_EXPERT_WORK_ENABLED=true`. Page entry points apply the same gate before rendering. The flag does not replace authorization; it only keeps the new surface unavailable until migrations, signing material, and release checks are ready.

- [ ] **Step 6: Permit safe `/review` redirects and run focused tests**

Add `/review` to `safeRedirectPath`'s authenticated allowlist and extend `tests/evals/routing.test.ts` with a positive `/review/assignments/<uuid>` case plus an external/open-redirect rejection.

Run: `npx vitest run tests/evals/stage-e-experts.test.ts tests/evals/stage-e-expert-db.test.ts tests/evals/routing.test.ts`

Expected: PASS, including the database-backed isolation and conflict cases.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/043_evals_expert_work.sql db/rollbacks/043_evals_expert_work_down.sql scripts/evals/migrate.ts lib/evals/experts/store.ts lib/evals/domain/expert-identity.ts lib/evals/domain/features.ts lib/evals/domain/routing.ts app/api/evals/v1/experts app/api/evals/v1/expert-assignments app/api/evals/v1/review tests/evals/stage-e-expert-db.test.ts tests/evals/routing.test.ts
git commit -m "feat(evals): add restricted expert assignments"
```

### Task 3: Expert workbench and operator quality workflow

**Files:**
- Create: `components/evals/expert-workbench.tsx`
- Create: `components/evals/expert-management.tsx`
- Create: `app/(evaluation)/review/page.tsx`
- Create: `app/(evaluation)/review/assignments/[id]/page.tsx`
- Create: `app/(evaluation)/ops/experts/page.tsx`
- Modify: `components/evals/shell.tsx`
- Modify: `components/evals/primitives.tsx`
- Modify: `lib/evals/messages/en.ts`
- Modify: `e2e/evals/ui-harness.tsx`
- Modify: `e2e/evals/ui.contract.ts`

**Interfaces:**
- Consumes: Task 2 routes and redacted projections.
- Produces: assignment queue, source/transcript + rubric workbench, conflict recovery, independent review/adjudication controls, quality/count views, conflict and manual-payment operator controls.

- [ ] **Step 1: Add failing Playwright scenarios**

```ts
test("expert workbench never renders hidden identities or unassigned evidence", async ({ page }) => {
  await page.route("**/api/evals/v1/review/assignments/**", (route) => route.fulfill({ json: { data: redactedFixture, meta: {} } }));
  await page.goto(`/review/assignments/${assignmentId}`);
  await expect(page.getByText("Redacted policy excerpt")).toBeVisible();
  await expect(page.getByText("PRIVATE_MODEL_SENTINEL")).toHaveCount(0);
  await expect(page.getByText("PRIVATE_AUTHOR_SENTINEL")).toHaveCount(0);
});

test("stale autosave reports a preserved conflict", async ({ page }) => {
  await page.route("**/api/evals/v1/review/assignments/**", (route) => route.fulfill({ json: { data: { conflict: true, preservedRevisionId: conflictId }, meta: {} } }));
  await page.goto(`/review/assignments/${assignmentId}`);
  await page.getByLabel("Answer").fill("Independent contribution");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Both versions were preserved");
});
```

Also add 390 px keyboard coverage for queue navigation, fields, save/submit, flag ambiguity, and focus restoration after a conflict dialog.

- [ ] **Step 2: Run the UI contract and verify RED**

Run: `npx playwright test --config=e2e/evals/ui.config.ts --grep "expert"`

Expected: FAIL because `/review` and the expert components are absent.

- [ ] **Step 3: Implement the workbench with platform primitives**

Use `PageHeading`, `Tabs`, `Toolbar`, `Card`, `DataTable`, `StatusBadge`, `Field`, `TextArea`, `SelectField`, `Action`, `Status`, and `EmptyState`. The operator view reports calibration/agreement/gold counts and prints `Not enough reviewed work to rank` when `reliable=false`. The expert view displays only the API projection, autosaves on an explicit command plus a bounded idle interval, uses the returned lock version, and never caches raw evidence outside component state.

Add status mappings for `assigned`, `in_progress`, `conflict`, `guideline_changed`, `submitted`, `in_review`, `changes_requested`, `approved`, `rejected`, and `adjudicated`. Add `/review` expert navigation only when the page has confirmed an expert profile; ordinary workspace users must not gain it from a menu-only role guess.

- [ ] **Step 4: Run UI, type, and accessibility-focused checks**

Run: `npx playwright test --config=e2e/evals/ui.config.ts`

Run: `npm run typecheck`

Expected: all UI scenarios and TypeScript checks pass at 390, 768, and 1440 widths with no horizontal document overflow.

- [ ] **Step 5: Commit**

```bash
git add components/evals/expert-workbench.tsx components/evals/expert-management.tsx 'app/(evaluation)/review' 'app/(evaluation)/ops/experts' components/evals/shell.tsx components/evals/primitives.tsx lib/evals/messages/en.ts e2e/evals/ui-harness.tsx e2e/evals/ui.contract.ts
git commit -m "feat(evals): add expert review workbench"
```

### Task 4: Improvement-dataset contracts, lineage schema, and release policy

**Files:**
- Create: `lib/evals/improvements/contracts.ts`
- Create: `lib/evals/improvements/release.ts`
- Create: `db/migrations/044_evals_improvement_releases.sql`
- Create: `db/rollbacks/044_evals_improvement_releases_down.sql`
- Modify: `scripts/evals/migrate.ts`
- Create: `tests/evals/stage-e-improvements.test.ts`
- Create: `tests/evals/stage-e-improvement-db.test.ts`

**Interfaces:**
- Consumes: findings from WP-06, approved expert submission revisions from WP-14, CEF family/split concepts, canonical hashing, Ed25519 signing helpers.
- Produces: `datasetItemSchema`, `datasetReleaseManifestSchema`, `validateReleaseCandidates`, `buildSignedDatasetArtifact`, `verifyDatasetArtifact`, and tenant tables for batches/tasks/items/releases/interventions.

- [ ] **Step 1: Write failing pure release tests**

```ts
it("round-trips every supported dataset item with lineage and split membership", () => {
  const artifact = buildSignedDatasetArtifact({ manifestInput, items: [qa, correction, preference, retrieval], privateKey });
  const parsed = verifyDatasetArtifact(artifact, publicKey);
  expect(parsed.items.map((item) => item.kind)).toEqual(["grounded_qa", "corrected_response", "preference_pair", "retrieval_content"]);
  expect(parsed.manifest.items.every((item) => item.finding_id && item.improvement_task_id)).toBe(true);
});

it("rejects a training family that overlaps an untouched holdout", () => {
  expect(() => validateReleaseCandidates({ items: [{ ...qa, split: "training", family_id: "family-a" }], heldOutFamilies: ["family-a"], priorReleases: [] })).toThrow("family_split_overlap");
});

it.each(["tampered", "truncated", "reordered", "wrong-key", "unknown-major"])("rejects %s artifacts", (mutation) => {
  expect(() => verifyDatasetArtifact(mutate(validArtifact, mutation), publicKey)).toThrow();
});
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run: `npx vitest run tests/evals/stage-e-improvements.test.ts`

Expected: FAIL because the improvement contracts and release artifact code do not exist.

- [ ] **Step 3: Implement strict item unions and signed JSONL artifact**

The four item kinds have explicit payloads:

```ts
type DatasetItem =
  | { kind: "grounded_qa"; question: string; answer: string; source_refs: SourceRef[] }
  | { kind: "corrected_response"; input: CandidateInput; rejected_response: string; corrected_response: string; rationale: string }
  | { kind: "preference_pair"; input: CandidateInput; chosen: string; rejected: string; rationale: string }
  | { kind: "retrieval_content"; title: string; body: string; source_refs: SourceRef[] };
```

Every envelope includes stable item/revision IDs, family, split, finding/task/submission lineage, rights basis, author/reviewer IDs, redaction decision, schema version, and content hash. The artifact is canonical UTF-8 JSONL: signed manifest first, then ordered items and data dictionary. The manifest hashes the ordered item descriptors and exact payload bytes; `verifyDatasetArtifact` validates schema major, byte hash, item hashes, order, signature, and declared count.

- [ ] **Step 4: Write the failing database lineage/release test**

The database test proves cross-tenant isolation, rejected-item exclusion, required independent QA, immutable revisions, previous-release family contamination detection, and intervention links to baseline/follow-up runs.

- [ ] **Step 5: Add migration 044 and release gates**

Migration 044 creates:

```sql
evals.improvement_batch
evals.improvement_task
evals.dataset_item
evals.dataset_item_revision
evals.dataset_item_review
evals.dataset_release
evals.dataset_release_item
evals.intervention_record
evals.intervention_validation
```

All are tenant-RLS protected. Revision, review, released-manifest, release membership, and intervention-validation rows are immutable. Composite foreign keys bind every finding, expert submission, project, run, and release to one tenant. A release can reference only `approved` revisions with `rights_status='permitted'`, `redaction_status='approved'`, and a distinct approving reviewer; the repository rechecks these under row locks even if the UI already validated them.

- [ ] **Step 6: Run pure and database tests**

Run: `npx vitest run tests/evals/stage-e-improvements.test.ts tests/evals/stage-e-improvement-db.test.ts`

Expected: PASS, including prior-release sibling-family rejection and immutable lineage.

- [ ] **Step 7: Commit**

```bash
git add lib/evals/improvements/contracts.ts lib/evals/improvements/release.ts db/migrations/044_evals_improvement_releases.sql db/rollbacks/044_evals_improvement_releases_down.sql scripts/evals/migrate.ts tests/evals/stage-e-improvements.test.ts tests/evals/stage-e-improvement-db.test.ts
git commit -m "feat(evals): define improvement dataset releases"
```

### Task 5: Improvement services, exports, and held-out follow-up validation

**Files:**
- Create: `lib/evals/improvements/store.ts`
- Create: `lib/evals/improvements/validation.ts`
- Create: `app/api/evals/v1/improvement-batches/route.ts`
- Create: `app/api/evals/v1/improvement-batches/[id]/route.ts`
- Create: `app/api/evals/v1/improvement-batches/[id]/items/route.ts`
- Create: `app/api/evals/v1/improvement-batches/[id]/release/route.ts`
- Create: `app/api/evals/v1/improvement-batches/[id]/validate/route.ts`
- Create: `app/api/evals/v1/dataset-artifacts/[id]/route.ts`
- Modify: `tests/evals/stage-e-improvement-db.test.ts`

**Interfaces:**
- Consumes: Task 4 contracts/tables, Task 2 approved submissions, WP-06 comparisons, WP-07 private artifact storage.
- Produces: `createImprovementBatch`, `createImprovementTask`, `promoteApprovedSubmission`, `reviewDatasetItem`, `releaseDataset`, `getDatasetArtifact`, `recordInterventionValidation`, `compareImprovementRuns`.

- [ ] **Step 1: Add failing service tests**

```ts
expect(await promoteApprovedSubmission(scope, taskId, submissionRevisionId)).toMatchObject({ status: "draft" });
await expect(releaseDataset(scope, batchId, privateKey)).rejects.toThrow("review_required");
await reviewDatasetItem(scope, itemRevisionId, { decision: "approve", rightsStatus: "permitted", redactionStatus: "approved" });
const released = await releaseDataset(scope, batchId, privateKey, inMemoryArtifactStore);
expect(verifyDatasetArtifact(inMemoryArtifactStore.bytes(released.artifactId), publicKey).manifest.release_id).toBe(released.releaseId);
```

Follow-up fixtures must contain matched case revisions across `training`, `validation`, and `holdout` splits. The result exposes each split separately and always includes a causality limitation; it must never collapse training gains into held-out evidence.

- [ ] **Step 2: Run the service test and verify RED**

Run: `npx vitest run tests/evals/stage-e-improvement-db.test.ts`

Expected: FAIL because the improvement store and validation services are absent.

- [ ] **Step 3: Implement transactionally checked release and private delivery**

`releaseDataset` locks the batch and candidate revisions, revalidates rights/redaction/QA/family contamination, creates a frozen manifest, signs and seals the artifact under `evals/<org>/<artifact>/sealed/...`, inserts artifact and release rows only after storage succeeds, and returns hash/size/public-key fingerprint. Retries return the existing ready artifact when the release content hash matches; a changed candidate set requires a new release revision. `getDatasetArtifact` checks current tenant/release permission on every request and streams verified bytes with attachment disposition.

The signing key is server-only via `EVALS_DATASET_SIGNING_KEY(_FILE)` and must be Ed25519. No private key or raw secret is stored in a release row or returned by an API.

- [ ] **Step 4: Implement split-aware before/after validation**

```ts
export function compareImprovementRuns(input: {
  baseline: OutcomeByCase;
  followup: OutcomeByCase;
  cases: Array<{ revisionId: string; familyId: string; split: "training" | "validation" | "holdout" }>;
}): {
  training: SplitComparison;
  validation: SplitComparison;
  holdout: SplitComparison;
  causality: "observational_after_recorded_intervention";
  limitations: string[];
};
```

The API records the customer intervention description/evidence reference, baseline and follow-up run IDs, compatible comparison ID, split counts/deltas, exclusions, and limitations as one immutable validation snapshot.

- [ ] **Step 5: Add bounded operator APIs and download gateway**

Every mutation requires operator/workspace-manage authority and an idempotency key. Item promotion accepts only an approved, tenant-matched expert submission revision. Release and validation endpoints return conflict errors for concurrent batch edits. Artifact downloads never expose object-store URLs.

- [ ] **Step 6: Run database, storage-contract, and scoring tests**

Run: `npx vitest run tests/evals/stage-e-improvement-db.test.ts tests/evals/storage.test.ts tests/evals/stage-b.test.ts tests/evals/stage-d-alerts.test.ts`

Expected: PASS with no target call during validation and no regression in existing scoring/comparison behavior.

- [ ] **Step 7: Commit**

```bash
git add lib/evals/improvements/store.ts lib/evals/improvements/validation.ts app/api/evals/v1/improvement-batches app/api/evals/v1/dataset-artifacts tests/evals/stage-e-improvement-db.test.ts
git commit -m "feat(evals): release verified improvement datasets"
```

### Task 6: Operator dataset UI and complete Stage E browser flow

**Files:**
- Create: `components/evals/improvement-datasets.tsx`
- Create: `app/(evaluation)/ops/improvements/page.tsx`
- Modify: `components/evals/shell.tsx`
- Modify: `components/evals/primitives.tsx`
- Modify: `lib/evals/messages/en.ts`
- Modify: `e2e/evals/ui-harness.tsx`
- Modify: `e2e/evals/ui.contract.ts`

**Interfaces:**
- Consumes: Task 5 APIs.
- Produces: finding → task → assigned work → item QA → release → download → recorded intervention → split-aware follow-up workflow.

- [ ] **Step 1: Add a failing browser workflow**

The route fixtures drive one batch from a high-severity finding through assigned expert work, approved dataset item, signed release, download, and follow-up comparison. Assertions verify that a rejected item cannot be selected, release buttons explain unmet rights/review gates, artifact links target the checked app gateway, and the follow-up view labels training, validation, and held-out results separately with the causality limitation visible.

- [ ] **Step 2: Run the Stage E browser workflow and verify RED**

Run: `npx playwright test --config=e2e/evals/ui.config.ts --grep "improvement dataset"`

Expected: FAIL because the improvement page and component do not exist.

- [ ] **Step 3: Implement the operator workflow**

Add an `Improvement datasets` entry under the operator Library group and keep `Experts` under Platform. Compose standard headings, tabs, toolbar, table, inspector cards, status badges, and explicit release checklist from existing primitives. Release is a deliberate operator action; creating a finding/task never modifies a customer system. The download copy states that exported files cannot be revoked after download.

- [ ] **Step 4: Verify responsive, keyboard, and complete UI behavior**

Run: `npx playwright test --config=e2e/evals/ui.config.ts`

Run: `npm run typecheck`

Expected: the complete UI suite and typecheck pass; Stage E screens work at 390, 768, and 1440 widths without exposing raw enums or private identities.

- [ ] **Step 5: Commit**

```bash
git add components/evals/improvement-datasets.tsx 'app/(evaluation)/ops/improvements' components/evals/shell.tsx components/evals/primitives.tsx lib/evals/messages/en.ts e2e/evals/ui-harness.tsx e2e/evals/ui.contract.ts
git commit -m "feat(evals): add improvement dataset workflow"
```

### Task 7: Stage E handoffs, release gate, full verification, and deployment

**Files:**
- Create: `docs/evals/work-packages/WP-14.md`
- Create: `docs/evals/work-packages/WP-15.md`
- Create: `scripts/evals/release-check-stage-e.ts`
- Create: `tests/evals/stage-e-release.test.ts`
- Modify: `package.json`
- Modify: `docs/evals/AGENTS.md`
- Modify: `docs/index.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TOOLS.md`

**Interfaces:**
- Consumes: all Stage E behavior and release evidence.
- Produces: exact operator/deployment contract, read-only release checker, package handoffs, deployed immutable image and production smoke evidence.

- [ ] **Step 1: Write the failing release-check test**

Add a testable checker function that requires migrations 043–044, a non-owner/NOBYPASSRLS runtime role, immutable triggers on submitted/released evidence, an Ed25519 dataset-signing key, and `EVALS_EXPERT_WORK_ENABLED=true` only when all checks pass. It must report IDs/counts only and never print key material, expert identities, or customer content.

- [ ] **Step 2: Run the checker test and verify RED**

Run: `npx vitest run tests/evals/stage-e-release.test.ts`

Expected: FAIL because the Stage E release checker does not exist.

- [ ] **Step 3: Implement release checker and documentation**

Add `npm run evals:release-check-stage-e`. Record exact migration compatibility, feature flag, signing-key rotation, private artifact delivery, manual payment boundary, deployment/rollback procedure, resource impact, known limitations, and acceptance evidence in WP-14/WP-15 handoffs. Update the nested evaluation instruction file to authorize Stage E while retaining invite-only customer access and the subagent prohibition.

- [ ] **Step 4: Validate migrations from scratch and rollback refusal**

Run a disposable PostgreSQL 16 container, apply migrations 031–044 through the migrator, provision a non-owner runtime inheriting `evals_runtime`, run the Stage E DB suites, verify both down files refuse destructive rollback, and destroy only the disposable container.

Expected: all migrations apply once, checksum rerun is a no-op, RLS tests pass, and destructive rollback exits non-zero with the documented forward-repair message.

- [ ] **Step 5: Run fresh full verification**

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm test -- --run`

Run: `npx playwright test --config=e2e/evals/ui.config.ts`

Run: `npm run build`

Expected: every command exits 0. Environment-dependent storage/live-provider checks may be skipped only when named in WP-14/WP-15 with their exact missing prerequisite.

- [ ] **Step 6: Commit handoffs and release tooling**

```bash
git add docs/evals/work-packages/WP-14.md docs/evals/work-packages/WP-15.md scripts/evals/release-check-stage-e.ts tests/evals/stage-e-release.test.ts package.json docs/evals/AGENTS.md docs/index.md docs/ARCHITECTURE.md docs/TOOLS.md
git commit -m "docs(evals): record Stage E release gate"
```

- [ ] **Step 7: Perform whole-branch review and fix Important/Critical findings**

Create the review package from the merge base through `HEAD`, perform the required self-review because repository policy forbids subagents, record rulings/minors in the execution ledger, and use test-first fixes for every Important/Critical finding.

- [ ] **Step 8: Deploy through the existing immutable release path**

Verify an encrypted off-host backup and current restore evidence; push the fast-forward Stage E commit to `main`; monitor the GitHub build/security/deploy workflow; apply migrations 043–044 under the existing advisory lock with the production migration owner; provision/verify the server-only Ed25519 dataset key; enable Stage E only after `evals:release-check-stage-e` passes; redeploy the immutable SHA-tagged image if the flag/key changed after the first rollout.

- [ ] **Step 9: Run production smoke checks**

Verify app-host auth and host isolation, operator Stage E navigation, an assignment-scoped expert fixture, stale-autosave conflict preservation, an approved synthetic four-item dataset release, checked artifact download/hash/signature, and a synthetic split-aware follow-up snapshot. Confirm no expert can access unassigned evidence, no raw source/object-store URL appears, marketing/CRM health is unchanged, and production logs contain no secret or customer content.

- [ ] **Step 10: Record deployment evidence**

Update WP-14/WP-15 with migration history, immutable image digest, commands/outcomes, synthetic-only probe scope, resource impact, rollback/feature-disable procedure, and any live acceptance limitation. Commit and fast-forward deploy this evidence-only update if production facts changed the handoff.
