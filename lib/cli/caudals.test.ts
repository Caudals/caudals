import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  createCliTestPrivateKey,
  runCaudalsCli,
} from "@/lib/cli/caudals";

async function writeJson(cwd: string, filename: string, value: unknown) {
  const target = join(cwd, filename);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

async function runCli(
  cwd: string,
  argv: string[],
  env: Partial<NodeJS.ProcessEnv> = {}
) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCaudalsCli(argv, {
    cwd,
    env: { NODE_ENV: "test", ...env } as NodeJS.ProcessEnv,
    io: {
      stdout: (message) => {
        stdout += message;
      },
      stderr: (message) => {
        stderr += message;
      },
    },
  });

  return { exitCode, stdout, stderr };
}

describe("caudals CLI", () => {
  it("lists the blueprint section 24 commands in help output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    const result = await runCli(cwd, ["help"]);

    expect(result.exitCode).toBe(0);
    for (const command of [
      "build plan",
      "build run",
      "build replay",
      "lineage trace",
      "license check",
      "pii scan",
      "dataset publish",
      "delivery sign",
      "dsar propagate",
      "fixture seed",
    ]) {
      expect(result.stdout).toContain(command);
    }
  });

  it("blocks non-composable license checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeJson(cwd, "license.json", {
      grants: [
        {
          id: "lc_a",
          permissions: {
            train: true,
            finetune: false,
            eval: true,
            commercialInference: false,
            redistribute: false,
          },
          geo: ["EU"],
        },
      ],
      requestedUse: {
        commercialInference: true,
        geo: ["US"],
      },
    });

    const result = await runCli(cwd, ["license", "check", "license.json"]);
    const body = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(2);
    expect(body.blocked).toBe(true);
    expect(body.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("commercialInference"),
        expect.stringContaining("US"),
      ])
    );
  });

  it("generates a build plan artifact with all release gates", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeJson(cwd, "brief.json", {
      id: "br_cli",
      title: "CLI pilot build",
      modality: "tabular",
      targetFormats: ["parquet", "jsonl"],
      requestedUse: { train: true, geo: ["EU"] },
      licenseGrants: [
        {
          id: "lc_cli",
          permissions: {
            train: true,
            finetune: true,
            eval: true,
            commercialInference: true,
            redistribute: false,
          },
          geo: ["EU"],
        },
      ],
    });

    const result = await runCli(cwd, [
      "build",
      "plan",
      "brief.json",
      "--format",
      "json",
      "--out",
      "plan.json",
    ]);
    const plan = JSON.parse(await readFile(join(cwd, "plan.json"), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(plan.kind).toBe("BuildPlan");
    expect(plan.metadata.generatedAt).toEqual(expect.any(String));
    expect(plan.spec.gates).toHaveLength(7);
    expect(plan.spec.composedLicense.permissions.train).toBe(true);
  });

  it("dry-runs build manifests and fails closed without Dagster configuration", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeFile(
      join(cwd, "plan.yaml"),
      [
        "apiVersion: caudals.io/build-plan/v1",
        "kind: BuildPlan",
        "metadata:",
        "  briefId: br_cli",
        "spec:",
        "  modality: tabular",
        "",
      ].join("\n"),
      "utf8"
    );

    const blocked = await runCli(cwd, ["build", "run", "plan.yaml"]);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr).toContain("DAGSTER_URL");

    const dryRun = await runCli(cwd, ["build", "run", "plan.yaml", "--dry-run"]);
    const body = JSON.parse(dryRun.stdout);

    expect(dryRun.exitCode).toBe(0);
    expect(body.dryRun).toBe(true);
    expect(body.manifestFormat).toBe("yaml");
    expect(body.planHash).toHaveLength(64);
  });

  it("replays builds from a manifest and verifies hash equality", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeJson(cwd, "manifest.json", {
      metadata: { buildId: "bd_cli" },
      spec: { operators: ["profile", "clean", "privacy"] },
    });

    const baseline = await runCli(cwd, [
      "build",
      "replay",
      "bd_cli",
      "--manifest",
      "manifest.json",
    ]);
    const baselineBody = JSON.parse(baseline.stdout);

    expect(baseline.exitCode).toBe(0);
    expect(baselineBody.buildId).toBe("bd_cli");
    expect(baselineBody.computedHash).toHaveLength(64);

    const verified = await runCli(cwd, [
      "build",
      "replay",
      "bd_cli",
      "--manifest",
      "manifest.json",
      "--expected-hash",
      baselineBody.computedHash,
    ]);
    expect(verified.exitCode).toBe(0);

    const mismatched = await runCli(cwd, [
      "build",
      "replay",
      "bd_cli",
      "--manifest",
      "manifest.json",
      "--expected-hash",
      "not-the-build-hash",
    ]);
    expect(mismatched.exitCode).toBe(2);
  });

  it("pretty-prints lineage traces for asset versions", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeJson(cwd, "lineage.json", {
      job: { namespace: "caudals.ops", name: "clean_normalize.v3" },
      run: { runId: "r_cli" },
      datasetVersionId: "dv_cli",
      inputs: [{ namespace: "caudals.bronze", name: "raw" }],
      outputs: [{ namespace: "caudals.silver", name: "clean" }],
    });

    const result = await runCli(cwd, ["lineage", "trace", "lineage.json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("caudals.ops/clean_normalize.v3");
    expect(result.stdout).toContain("run=r_cli");
    expect(result.stdout).toContain("inputs=1 outputs=1");
  });

  it("detects PII without printing the full sensitive value", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeFile(
      join(cwd, "asset.txt"),
      "Contact maria@example.com for the delivery receipt.",
      "utf8"
    );

    const result = await runCli(cwd, [
      "pii",
      "scan",
      "asset.txt",
      "--fail-on-findings",
    ]);
    const body = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(2);
    expect(body.summary.totalFindings).toBe(1);
    expect(body.findings[0].type).toBe("email");
    expect(body.findings[0].sample).not.toContain("example.com");
  });

  it("builds release documentation bundles for dataset publishing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeJson(cwd, "release.json", {
      dataset: { id: "dt_cli", name: "CLI receipts", modality: "tabular" },
      version: {
        id: "dv_cli",
        label: "v1",
        manifestUri: "s3://caudals-gold/dt_cli/v1/manifest.json",
        contentHash: "sha256:cli",
        recordCount: 100,
        qaScore: 0.91,
      },
      catalogue: {
        visibility: "private",
        licenseTier: "supplier-contract",
      },
    });

    const result = await runCli(cwd, ["dataset", "publish", "release.json"]);
    const body = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(body.bundle.validationSummary.status).toBe("pass");
    expect(body.bundle.packageManifest.requiredDocuments).toHaveLength(10);
    expect(body.bundle.croissantManifest.conformsTo).toContain("croissant");
  });

  it("signs delivery artifacts with an explicit Ed25519 private key", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeFile(join(cwd, "artifact.txt"), "package-bytes", "utf8");
    await writeFile(join(cwd, "key.pem"), createCliTestPrivateKey(), "utf8");

    const result = await runCli(cwd, [
      "delivery",
      "sign",
      "artifact.txt",
      "--private-key",
      "key.pem",
    ]);
    const body = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(body.algorithm).toBe("Ed25519");
    expect(body.signature).toEqual(expect.any(String));
    expect(body.sha256).toHaveLength(64);
  });

  it("plans DSAR propagation through derivative dataset versions", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));
    await writeJson(cwd, "ticket.json", {
      ticketId: "dsar_cli",
      subjectRef: "subject_hash",
      requestType: "erasure",
      affectedVersions: [
        { id: "dv_rebuild", canRebuild: true, hasActiveDelivery: true },
        { id: "dv_tombstone", canRebuild: false, hasActiveDelivery: false },
      ],
    });

    const result = await runCli(cwd, ["dsar", "propagate", "ticket.json"]);
    const body = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(body.ticketId).toBe("dsar_cli");
    expect(body.actions).toEqual([
      expect.objectContaining({
        datasetVersionId: "dv_rebuild",
        action: "rebuild_without_subject",
        notifyBuyers: true,
      }),
      expect.objectContaining({
        datasetVersionId: "dv_tombstone",
        action: "tombstone_version",
        notifyBuyers: false,
      }),
    ]);
  });

  it("reports fixture seeding plans in dry-run mode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "caudals-cli-"));

    const result = await runCli(cwd, ["fixture", "seed", "--dry-run"]);
    const body = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(body.dryRun).toBe(true);
    expect(body.script).toBe("npm run fixtures:ensure");
  });
});
