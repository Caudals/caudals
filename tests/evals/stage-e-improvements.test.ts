import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { datasetItemSchema, type DatasetItem } from "../../lib/evals/improvements/contracts";
import {
  buildSignedDatasetArtifact,
  validateReleaseCandidates,
  verifyDatasetArtifact,
} from "../../lib/evals/improvements/release";
import { compareImprovementRuns } from "../../lib/evals/improvements/validation";

const ids = {
  project: "00000000-0000-4000-8000-000000000201",
  batch: "00000000-0000-4000-8000-000000000202",
  release: "00000000-0000-4000-8000-000000000203",
  finding: "00000000-0000-4000-8000-000000000204",
  task: "00000000-0000-4000-8000-000000000205",
  submission: "00000000-0000-4000-8000-000000000206",
  author: "00000000-0000-4000-8000-000000000207",
  reviewer: "00000000-0000-4000-8000-000000000208",
  source: "00000000-0000-4000-8000-000000000209",
};

function item(
  kind: DatasetItem["kind"],
  ordinal: number,
  payload: Record<string, unknown>,
  split: DatasetItem["split"] = "training",
) {
  return datasetItemSchema.parse(withContentHash({
    schema_version: "1.0",
    item_id: `00000000-0000-4000-8000-${String(210 + ordinal).padStart(12, "0")}`,
    revision_id: `00000000-0000-4000-8000-${String(220 + ordinal).padStart(12, "0")}`,
    kind,
    family_id: `family-${ordinal}`,
    split,
    finding_id: ids.finding,
    improvement_task_id: ids.task,
    submission_revision_id: ids.submission,
    author_profile_id: ids.author,
    reviewer_profile_id: ids.reviewer,
    status: "approved",
    rights_basis: "customer_owned",
    rights_status: "permitted",
    redaction_status: "approved",
    created_at: "2026-09-21T10:00:00.000Z",
    payload,
  }));
}

const qa = item("grounded_qa", 1, {
  question: "When must a claim be filed?", answer: "Within 30 days.",
  source_refs: [{ source_revision_id: ids.source, anchor: "claims-1" }],
});
const correction = item("corrected_response", 2, {
  input: { messages: [{ role: "user", content: "When must I file?" }] },
  rejected_response: "Any time.", corrected_response: "Within 30 days.", rationale: "The policy fixes a 30-day limit.",
});
const preference = item("preference_pair", 3, {
  input: { messages: [{ role: "user", content: "When must I file?" }] },
  chosen: "Within 30 days.", rejected: "Any time.", rationale: "The chosen answer is grounded.",
}, "validation");
const retrieval = item("retrieval_content", 4, {
  title: "Claims deadline", body: "Claims must be filed within 30 days.",
  source_refs: [{ source_revision_id: ids.source, anchor: "claims-1" }],
}, "holdout");

function keys() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

function artifactFor(privateKey: string) {
  return buildSignedDatasetArtifact({
    manifestInput: {
      release_id: ids.release, batch_id: ids.batch, project_id: ids.project,
      created_at: "2026-09-21T12:00:00.000Z",
    },
    items: [qa, correction, preference, retrieval],
    privateKey,
  });
}

describe("WP-15 signed improvement dataset releases", () => {
  it("round-trips every supported item with complete lineage and split membership", () => {
    const key = keys();
    const parsed = verifyDatasetArtifact(artifactFor(key.privateKey), key.publicKey);
    expect(parsed.items.map((candidate) => candidate.kind)).toEqual([
      "grounded_qa", "corrected_response", "preference_pair", "retrieval_content",
    ]);
    expect(parsed.items.map((candidate) => candidate.split)).toEqual(["training", "training", "validation", "holdout"]);
    expect(parsed.manifest.items.every((candidate) => candidate.finding_id && candidate.improvement_task_id)).toBe(true);
  });

  it("rejects family overlap with untouched or previously released holdouts", () => {
    const training = { ...qa, family_id: "family-a", split: "training" as const };
    expect(() => validateReleaseCandidates({ items: [training], heldOutFamilies: ["family-a"], priorReleases: [] })).toThrow("family_split_overlap");
    expect(() => validateReleaseCandidates({
      items: [training], heldOutFamilies: [], priorReleases: [{ family_id: "family-a", split: "holdout" }],
    })).toThrow("family_split_overlap");
  });

  it("requires permitted rights, approved redaction, independent QA and approved state", () => {
    expect(() => validateReleaseCandidates({ items: [{ ...qa, reviewer_profile_id: ids.author }], heldOutFamilies: [], priorReleases: [] })).toThrow("independent_review_required");
    expect(() => validateReleaseCandidates({ items: [{ ...qa, rights_status: "restricted" }], heldOutFamilies: [], priorReleases: [] })).toThrow("rights_not_permitted");
    expect(() => validateReleaseCandidates({ items: [{ ...qa, redaction_status: "pending" }], heldOutFamilies: [], priorReleases: [] })).toThrow("redaction_not_approved");
    expect(() => validateReleaseCandidates({ items: [{ ...qa, status: "draft" }], heldOutFamilies: [], priorReleases: [] })).toThrow("review_required");
  });

  it.each(["tampered", "truncated", "reordered", "wrong-key", "unknown-major"])("rejects %s artifacts", (mutation) => {
    const key = keys(); const other = keys(); const valid = artifactFor(key.privateKey);
    const lines = Buffer.from(valid).toString("utf8").trimEnd().split("\n");
    let changed = valid; let publicKey = key.publicKey;
    if (mutation === "tampered") changed = Buffer.from(Buffer.from(valid).toString("utf8").replace("Within 30 days.", "Within 31 days."));
    if (mutation === "truncated") changed = Buffer.from(lines.slice(0, -1).join("\n") + "\n");
    if (mutation === "reordered") changed = Buffer.from([lines[0], lines[2], lines[1], ...lines.slice(3)].join("\n") + "\n");
    if (mutation === "wrong-key") publicKey = other.publicKey;
    if (mutation === "unknown-major") {
      const manifest = JSON.parse(lines[0]); manifest.schema_version = "2.0";
      lines[0] = JSON.stringify(manifest); changed = Buffer.from(lines.join("\n") + "\n");
    }
    expect(() => verifyDatasetArtifact(changed, publicKey)).toThrow();
  });

  it("reports training, validation and holdout separately with an observational limitation", () => {
    const result = compareImprovementRuns({
      baseline: { train: "fail", validate: "partial", hold: "fail" },
      followup: { train: "pass", validate: "pass", hold: "partial" },
      cases: [
        { revisionId: "train", familyId: "family-train", split: "training" },
        { revisionId: "validate", familyId: "family-validate", split: "validation" },
        { revisionId: "hold", familyId: "family-hold", split: "holdout" },
      ],
    });
    expect(result.training.delta).toBe(1);
    expect(result.validation.delta).toBe(0.5);
    expect(result.holdout.delta).toBe(0.5);
    expect(result.causality).toBe("observational_after_recorded_intervention");
    expect(result.limitations.join(" ")).toMatch(/does not prove causality/i);
  });
});
