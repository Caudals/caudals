import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assessStageERelease } from "../../scripts/evals/release-check-stage-e";

const key = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const ready = {
  migrations: ["043_evals_expert_work.sql", "044_evals_improvement_releases.sql"],
  runtimeRole: { name: "evals_runtime", superuser: false, bypassRls: false, login: false, ownedObjects: 0, memberCount: 1, unsafeMemberCount: 0 },
  immutableTriggers: [
    "expert_submission_immutable", "expert_quality_immutable", "dataset_item_revision_immutable",
    "dataset_item_review_immutable", "dataset_release_immutable", "dataset_release_item_immutable",
    "intervention_validation_immutable",
  ],
  signingKey: key,
  featureEnabled: true,
};

describe("Stage E release gate", () => {
  it("accepts only complete migrations, least-privileged runtime, immutable evidence and Ed25519 signing", () => {
    expect(assessStageERelease(ready)).toEqual({
      status: "ready",
      migrations: ["043_evals_expert_work.sql", "044_evals_improvement_releases.sql"],
      runtimeRole: "evals_runtime",
      ownedObjects: 0,
      runtimeMemberCount: 1,
      immutableTriggerCount: 7,
      featureEnabled: true,
      signingKeyType: "ed25519",
    });
  });

  it.each([
    ["migration", { migrations: ["043_evals_expert_work.sql"] }],
    ["superuser", { runtimeRole: { ...ready.runtimeRole, superuser: true } }],
    ["bypass RLS", { runtimeRole: { ...ready.runtimeRole, bypassRls: true } }],
    ["object owner", { runtimeRole: { ...ready.runtimeRole, ownedObjects: 1 } }],
    ["unsafe login member", { runtimeRole: { ...ready.runtimeRole, unsafeMemberCount: 1 } }],
    ["immutable trigger", { immutableTriggers: ready.immutableTriggers.slice(1) }],
    ["feature flag", { featureEnabled: false }],
    ["signing key", { signingKey: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString() }],
  ])("rejects an invalid %s gate", (_name, changed) => {
    expect(() => assessStageERelease({ ...ready, ...changed })).toThrow();
  });

  it("never returns signing material, expert identity or customer content", () => {
    const output = JSON.stringify(assessStageERelease({ ...ready,
      expertIdentity: "PRIVATE_EXPERT_IDENTITY", customerContent: "PRIVATE_CUSTOMER_CONTENT",
    } as typeof ready));
    expect(output).not.toContain("PRIVATE KEY");
    expect(output).not.toContain("PRIVATE_EXPERT_IDENTITY");
    expect(output).not.toContain("PRIVATE_CUSTOMER_CONTENT");
  });
});
