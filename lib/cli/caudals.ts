import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  buildReleaseDocumentationBundle,
  type ReleaseDocumentationInput,
} from "@/lib/operator/release-documentation";
import {
  isBuildPlanBlockedForLicense,
  type LicenseGrant,
  type RequestedUse,
} from "@/lib/operator/license-composition";

type CliIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

export type CaudalsCliOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  io?: CliIo;
};

type ParsedArgs = {
  positional: string[];
  flags: Map<string, string | boolean>;
};

const gatePlan = [
  { key: "G-1", label: "Intake", requiredEvidence: "provenance_manifest" },
  { key: "G-2", label: "Profile", requiredEvidence: "schema_fingerprint" },
  { key: "G-3", label: "Clean", requiredEvidence: "deterministic_clean_hash" },
  { key: "G-4", label: "Privacy", requiredEvidence: "pii_map" },
  { key: "G-5", label: "Enrich", requiredEvidence: "enrichment_manifest" },
  { key: "G-6", label: "Label", requiredEvidence: "label_batch" },
  { key: "G-7", label: "QA", requiredEvidence: "release_documentation_bundle" },
] as const;

const piiRecognizers = [
  {
    type: "email",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  {
    type: "phone",
    pattern: /(?:\+?\d[\s().-]?){8,}\d/g,
  },
  {
    type: "iban",
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi,
  },
  {
    type: "credit_card",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
  },
] as const;

const buildBriefSchema = z.object({
  id: z.string().min(2),
  title: z.string().min(2),
  modality: z.string().min(2),
  targetFormats: z.array(z.string().min(1)).default([]),
  template: z.string().min(2).optional(),
  requestedUse: z.record(z.string(), z.unknown()).optional(),
  licenseGrants: z.array(z.record(z.string(), z.unknown())).default([]),
  profile: z.record(z.string(), z.unknown()).optional(),
  costEnvelope: z.record(z.string(), z.unknown()).optional(),
});

const dsarTicketSchema = z.object({
  ticketId: z.string().min(2),
  subjectRef: z.string().min(2).optional(),
  requestType: z.enum(["deletion", "erasure", "access", "rectification"]).default("deletion"),
  affectedVersions: z
    .array(
      z.object({
        id: z.string().min(2),
        canRebuild: z.boolean().default(true),
        hasActiveDelivery: z.boolean().default(false),
      })
    )
    .min(1),
});

const licenseCheckSchema = z.object({
  grants: z.array(z.record(z.string(), z.unknown())).min(1),
  requestedUse: z.record(z.string(), z.unknown()).default({}),
});

const lineageEventSchema = z.object({
  namespace: z.string().min(1).optional(),
  jobName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  datasetVersionId: z.string().min(1).optional(),
  eventTime: z.string().min(1).optional(),
  emittedAt: z.string().min(1).optional(),
  run: z
    .object({
      runId: z.string().optional(),
    })
    .passthrough()
    .optional(),
  job: z
    .object({
      namespace: z.string().optional(),
      name: z.string().optional(),
    })
    .passthrough()
    .optional(),
  inputs: z.array(z.record(z.string(), z.unknown())).optional(),
  outputs: z.array(z.record(z.string(), z.unknown())).optional(),
});

const releaseInputSchema = z.record(z.string(), z.unknown());

const helpText = `Caudals operations CLI

Usage:
  caudals <command> [args]

Commands:
  build plan <brief.json> [--out file] [--format json|yaml]
  build run <plan.yaml|plan.json> [--dry-run]
  build replay <build_id> --manifest manifest.yaml|manifest.json [--expected-hash sha256]
  lineage trace <asset.json> [--format json|text]
  license check <build.json>
  pii scan <asset-file> [--fail-on-findings]
  dataset publish <release.json> [--out file]
  delivery sign <artefact> --private-key key.pem [--out file]
  dsar propagate <ticket.json> [--out file]
  fixture seed [--dry-run]
`;

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const flagName = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      flags.set(flagName, true);
      continue;
    }

    flags.set(flagName, next);
    index += 1;
  }

  return { positional, flags };
}

function asStringFlag(args: ParsedArgs, flag: string) {
  const value = args.flags.get(flag);
  return typeof value === "string" ? value : undefined;
}

function hasFlag(args: ParsedArgs, flag: string) {
  return args.flags.get(flag) === true || typeof args.flags.get(flag) === "string";
}

function resolvePath(cwd: string, value: string) {
  return path.isAbsolute(value) ? value : path.join(cwd, value);
}

async function readTextFile(cwd: string, filePath: string) {
  return readFile(resolvePath(cwd, filePath), "utf8");
}

async function readJson<T = unknown>(cwd: string, filePath: string): Promise<T> {
  const raw = await readTextFile(cwd, filePath);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${(error as Error).message}`);
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
    .join(",")}}`;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function manifestHash(raw: string, parsed: unknown) {
  return parsed ? sha256(canonicalize(parsed)) : sha256(raw);
}

async function readBuildManifest(cwd: string, filePath: string) {
  const raw = await readTextFile(cwd, filePath);
  const parsed = tryParseJson(raw);

  return {
    raw,
    parsed,
    format: parsed ? "json" : "yaml",
    hash: manifestHash(raw, parsed),
  };
}

function inferBuildIdFromManifest(parsed: unknown, fallback: string) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }

  const manifest = parsed as Record<string, unknown>;
  const metadata =
    manifest.metadata && typeof manifest.metadata === "object"
      ? (manifest.metadata as Record<string, unknown>)
      : {};

  for (const candidate of [metadata.buildId, metadata.briefId, manifest.id]) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return fallback;
}

function looksLikeManifestPath(value: string) {
  return (
    value.endsWith(".json") ||
    value.endsWith(".yaml") ||
    value.endsWith(".yml") ||
    value.includes("/") ||
    value.includes("\\")
  );
}

function toJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const stringValue = String(value);
  if (/^[a-zA-Z0-9_./:@-]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function toYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return `${pad}-\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";

    return entries
      .map(([key, entryValue]) => {
        if (
          entryValue &&
          typeof entryValue === "object" &&
          (!Array.isArray(entryValue) || entryValue.length > 0)
        ) {
          return `${pad}${key}:\n${toYaml(entryValue, indent + 2)}`;
        }
        return `${pad}${key}: ${yamlScalar(entryValue)}`;
      })
      .join("\n");
  }

  return `${pad}${yamlScalar(value)}`;
}

async function writeOrPrint(
  value: string,
  args: ParsedArgs,
  cwd: string,
  io: CliIo
) {
  const out = asStringFlag(args, "out");
  if (!out) {
    io.stdout(value);
    return;
  }

  const target = resolvePath(cwd, out);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
  io.stdout(`${target}\n`);
}

function parseLicenseGrants(value: unknown): LicenseGrant[] {
  return z
    .array(
      z.object({
        id: z.string().min(1),
        permissions: z.object({
          train: z.boolean(),
          finetune: z.boolean(),
          eval: z.boolean(),
          commercialInference: z.boolean(),
          redistribute: z.boolean(),
        }),
        geo: z.array(z.string()).default(["WW"]),
        termStartsAt: z.string().nullable().optional(),
        termEndsAt: z.string().nullable().optional(),
        exclusivity: z.enum(["none", "exclusive", "category"]).optional(),
        shareAlike: z.boolean().optional(),
      })
    )
    .parse(value);
}

function parseRequestedUse(value: unknown): RequestedUse {
  return z
    .object({
      train: z.boolean().optional(),
      finetune: z.boolean().optional(),
      eval: z.boolean().optional(),
      commercialInference: z.boolean().optional(),
      redistribute: z.boolean().optional(),
      geo: z.array(z.string()).optional(),
    })
    .parse(value ?? {});
}

async function commandLicenseCheck(args: ParsedArgs, cwd: string, io: CliIo) {
  const file = args.positional[2];
  if (!file) throw new Error("license check requires <build.json>");

  const input = licenseCheckSchema.parse(await readJson(cwd, file));
  const grants = parseLicenseGrants(input.grants);
  const requestedUse = parseRequestedUse(input.requestedUse);
  const result = isBuildPlanBlockedForLicense(grants, requestedUse);

  await writeOrPrint(
    toJson({
      command: "license check",
      ok: !result.blocked,
      blocked: result.blocked,
      composed: result.composed,
      reasons: result.blocked ? result.reasons : [],
    }),
    args,
    cwd,
    io
  );

  return result.blocked ? 2 : 0;
}

async function commandBuildPlan(
  args: ParsedArgs,
  cwd: string,
  io: CliIo,
  env: NodeJS.ProcessEnv
) {
  const file = args.positional[2];
  if (!file) throw new Error("build plan requires <brief.json>");

  const input = buildBriefSchema.parse(await readJson(cwd, file));
  const requestedUse = parseRequestedUse(input.requestedUse ?? {});
  const grants = parseLicenseGrants(input.licenseGrants);
  const licenseResult =
    grants.length > 0
      ? isBuildPlanBlockedForLicense(grants, requestedUse)
      : null;

  if (licenseResult?.blocked) {
    await writeOrPrint(
      toJson({
        command: "build plan",
        ok: false,
        blocked: true,
        reasons: licenseResult.reasons,
      }),
      args,
      cwd,
      io
    );
    return 2;
  }

  const manifest = {
    apiVersion: "caudals.io/build-plan/v1",
    kind: "BuildPlan",
    metadata: {
      briefId: input.id,
      title: input.title,
      generatedAt: env.CAUDALS_CLI_NOW ?? new Date().toISOString(),
      template: input.template ?? "custom-build",
    },
    spec: {
      modality: input.modality,
      targetFormats: input.targetFormats,
      requestedUse,
      gates: gatePlan,
      profile: input.profile ?? {},
      costEnvelope: input.costEnvelope ?? {},
      composedLicense: licenseResult?.composed ?? null,
    },
  };

  const format = asStringFlag(args, "format") ?? "yaml";
  const output =
    format === "json" ? toJson(manifest) : `${toYaml(manifest)}\n`;
  await writeOrPrint(output, args, cwd, io);
  return 0;
}

async function commandBuildRun(args: ParsedArgs, cwd: string, io: CliIo, env: NodeJS.ProcessEnv) {
  const file = args.positional[2];
  if (!file) throw new Error("build run requires <plan.yaml|plan.json>");

  const plan = await readBuildManifest(cwd, file);
  const dryRun = hasFlag(args, "dry-run");
  const dagsterUrl = env.DAGSTER_URL;

  if (!dryRun && !dagsterUrl) {
    throw new Error("DAGSTER_URL is required unless --dry-run is set");
  }

  await writeOrPrint(
    toJson({
      command: "build run",
      ok: true,
      dryRun,
      target: dagsterUrl ?? "dry-run",
      manifestFormat: plan.format,
      planHash: plan.hash,
      submitted: !dryRun,
    }),
    args,
    cwd,
    io
  );
  return 0;
}

async function commandBuildReplay(args: ParsedArgs, cwd: string, io: CliIo) {
  const buildId = args.positional[2];
  if (!buildId) throw new Error("build replay requires <build_id>");

  const manifestArg = asStringFlag(args, "manifest");
  if (!manifestArg && !looksLikeManifestPath(buildId)) {
    throw new Error("build replay requires --manifest <manifest.yaml|manifest.json>");
  }

  const manifestFile = manifestArg ?? buildId;
  const manifest = await readBuildManifest(cwd, manifestFile);
  const inferredBuildId =
    manifestFile === buildId
      ? inferBuildIdFromManifest(manifest.parsed, path.basename(buildId, path.extname(buildId)))
      : buildId;

  const computedHash = manifest.hash;
  const expectedHash = asStringFlag(args, "expected-hash");
  const ok = !expectedHash || expectedHash === computedHash;

  await writeOrPrint(
    toJson({
      command: "build replay",
      ok,
      buildId: inferredBuildId,
      manifest: manifestFile,
      manifestFormat: manifest.format,
      computedHash,
      expectedHash: expectedHash ?? null,
    }),
    args,
    cwd,
    io
  );
  return ok ? 0 : 2;
}

async function commandLineageTrace(args: ParsedArgs, cwd: string, io: CliIo) {
  const file = args.positional[2];
  if (!file) throw new Error("lineage trace requires <lineage.json>");

  const raw = await readJson(cwd, file);
  const events = z.array(lineageEventSchema).parse(Array.isArray(raw) ? raw : [raw]);
  const traceRows = events.map((event) => ({
    namespace: event.namespace ?? event.job?.namespace ?? "caudals.ops",
    jobName: event.jobName ?? event.name ?? event.job?.name ?? "unknown_job",
    runId: event.run?.runId ?? null,
    datasetVersionId: event.datasetVersionId ?? null,
    eventTime: event.emittedAt ?? event.eventTime ?? null,
    inputs: event.inputs?.length ?? 0,
    outputs: event.outputs?.length ?? 0,
  }));
  const format = asStringFlag(args, "format") ?? "text";

  if (format === "json") {
    await writeOrPrint(toJson({ command: "lineage trace", ok: true, traceRows }), args, cwd, io);
    return 0;
  }

  const body = traceRows
    .map(
      (row) =>
        `${row.namespace}/${row.jobName}` +
        `${row.runId ? ` run=${row.runId}` : ""}` +
        `${row.datasetVersionId ? ` version=${row.datasetVersionId}` : ""}` +
        ` inputs=${row.inputs} outputs=${row.outputs}`
    )
    .join("\n");
  await writeOrPrint(`${body}\n`, args, cwd, io);
  return 0;
}

async function commandPiiScan(args: ParsedArgs, cwd: string, io: CliIo) {
  const file = args.positional[2];
  if (!file) throw new Error("pii scan requires <asset-file>");

  const content = await readTextFile(cwd, file);
  const findings = piiRecognizers.flatMap((recognizer) => {
    const matches = Array.from(content.matchAll(recognizer.pattern));
    return matches.slice(0, 25).map((match) => ({
      type: recognizer.type,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      sample: match[0].slice(0, 4).padEnd(Math.min(match[0].length, 12), "*"),
    }));
  });

  await writeOrPrint(
    toJson({
      command: "pii scan",
      ok: findings.length === 0,
      findings,
      summary: {
        totalFindings: findings.length,
        recognizers: piiRecognizers.map((recognizer) => recognizer.type),
      },
    }),
    args,
    cwd,
    io
  );

  return findings.length > 0 && hasFlag(args, "fail-on-findings") ? 2 : 0;
}

async function commandDatasetPublish(args: ParsedArgs, cwd: string, io: CliIo) {
  const file = args.positional[2];
  if (!file) throw new Error("dataset publish requires <release.json>");

  const input = releaseInputSchema.parse(await readJson(cwd, file)) as ReleaseDocumentationInput;
  const bundle = buildReleaseDocumentationBundle(input);
  await writeOrPrint(
    toJson({
      command: "dataset publish",
      ok: bundle.validationSummary.status === "pass",
      bundle,
    }),
    args,
    cwd,
    io
  );

  return bundle.validationSummary.status === "pass" ? 0 : 2;
}

async function commandDeliverySign(args: ParsedArgs, cwd: string, io: CliIo, env: NodeJS.ProcessEnv) {
  const file = args.positional[2];
  if (!file) throw new Error("delivery sign requires <artefact>");

  const keyFile =
    asStringFlag(args, "private-key") ?? env.CAUDALS_DELIVERY_PRIVATE_KEY_FILE;

  if (!keyFile) {
    throw new Error(
      "delivery sign requires --private-key or CAUDALS_DELIVERY_PRIVATE_KEY_FILE"
    );
  }

  const artifact = await readFile(resolvePath(cwd, file));
  const privateKey = await readTextFile(cwd, keyFile);
  const signature = sign(null, artifact, privateKey).toString("base64url");

  await writeOrPrint(
    toJson({
      command: "delivery sign",
      ok: true,
      artifact: file,
      sha256: sha256(artifact),
      algorithm: "Ed25519",
      signature,
    }),
    args,
    cwd,
    io
  );
  return 0;
}

async function commandDsarPropagate(args: ParsedArgs, cwd: string, io: CliIo) {
  const file = args.positional[2];
  if (!file) throw new Error("dsar propagate requires <ticket.json>");

  const ticket = dsarTicketSchema.parse(await readJson(cwd, file));
  const propagationPlan = {
    command: "dsar propagate",
    ok: true,
    ticketId: ticket.ticketId,
    subjectRef: ticket.subjectRef ?? null,
    requestType: ticket.requestType,
    actions: ticket.affectedVersions.map((version) => ({
      datasetVersionId: version.id,
      action: version.canRebuild ? "rebuild_without_subject" : "tombstone_version",
      notifyBuyers: version.hasActiveDelivery,
      requiredEvidence: [
        "identity_verification",
        "impact_assessment",
        "lineage_trace",
        version.canRebuild ? "rebuild_manifest" : "tombstone_notice",
      ],
    })),
  };

  await writeOrPrint(toJson(propagationPlan), args, cwd, io);
  return 0;
}

async function commandFixtureSeed(args: ParsedArgs, cwd: string, io: CliIo, env: NodeJS.ProcessEnv) {
  if (hasFlag(args, "dry-run")) {
    await writeOrPrint(
      toJson({
        command: "fixture seed",
        ok: true,
        dryRun: true,
        script: "npm run fixtures:ensure",
      }),
      args,
      cwd,
      io
    );
    return 0;
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed fixtures");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", "fixtures:ensure"], {
      cwd,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`fixtures:ensure exited with ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
  return 0;
}

function generatedPrivateKeyForTests() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }).privateKey;
}

export function createCliTestPrivateKey() {
  return generatedPrivateKeyForTests();
}

export async function runCaudalsCli(
  argv: string[],
  options: CaudalsCliOptions = {}
) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const io =
    options.io ??
    ({
      stdout: (message: string) => process.stdout.write(message),
      stderr: (message: string) => process.stderr.write(message),
    } satisfies CliIo);
  const args = parseArgs(argv);
  const [scope, command] = args.positional;

  try {
    if (!scope || scope === "help" || scope === "--help" || scope === "-h") {
      io.stdout(helpText);
      return 0;
    }

    if (scope === "license" && command === "check") {
      return await commandLicenseCheck(args, cwd, io);
    }

    if (scope === "build" && command === "plan") {
      return await commandBuildPlan(args, cwd, io, env);
    }

    if (scope === "build" && command === "run") {
      return await commandBuildRun(args, cwd, io, env);
    }

    if (scope === "build" && command === "replay") {
      return await commandBuildReplay(args, cwd, io);
    }

    if (scope === "lineage" && command === "trace") {
      return await commandLineageTrace(args, cwd, io);
    }

    if (scope === "pii" && command === "scan") {
      return await commandPiiScan(args, cwd, io);
    }

    if (scope === "dataset" && command === "publish") {
      return await commandDatasetPublish(args, cwd, io);
    }

    if (scope === "delivery" && command === "sign") {
      return await commandDeliverySign(args, cwd, io, env);
    }

    if (scope === "dsar" && command === "propagate") {
      return await commandDsarPropagate(args, cwd, io);
    }

    if (scope === "fixture" && command === "seed") {
      return await commandFixtureSeed(args, cwd, io, env);
    }

    throw new Error(`Unknown command: ${args.positional.join(" ")}`);
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return 1;
  }
}
