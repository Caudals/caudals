/**
 * The example evaluation (launch L-33) is read-only by construction: it lives
 * only in versioned fixtures, its identifiers can never name a database row,
 * and no API route, repository, worker or billing/analytics query reads it.
 * The database-backed half is tests/evals/example-evaluation-db.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { exampleBundle } from "@/lib/evals/example";

const root = process.cwd();
function files(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
  });
}
/** Every module path under lib/evals/example a file imports, statically or dynamically. */
const exampleImports = (path: string) =>
  [...readFileSync(join(root, path), "utf8").matchAll(/(?:from\s+|import\()["']([^"']*evals\/example(?:\/[^"']*)?)["']/g)].map((match) => match[1]);
/**
 * Reading the example's on/off flag is not reading the example: the flags
 * module only reads the environment (checked below), so a route may ask
 * whether the example is enabled (launch L-06: the per-workspace "hide the
 * example" preference) without touching the fixtures.
 */
const FLAG_ONLY = /(?:^|\/)evals\/example\/flags$/;
const imports = (path: string) => exampleImports(path).some((specifier) => !FLAG_ONLY.test(specifier));

/** Every file allowed to read the example fixtures: the pages that show it and the tooling around it. */
const READERS = new Set([
  "app/(evaluation)/(authenticated)/workspace/example/page.tsx",
  "app/[locale]/sample-report/page.tsx",
  "app/sample-report/[file]/route.ts",
  "app/page-sitemap.xml/route.ts",
  "app/llms.txt/route.ts",
  "components/evals/example-evaluation.tsx",
  "components/evals/example-evaluation-links.tsx",
  "components/evals/shell.tsx",
  "components/sample-report/sample-report-page.tsx",
]);

describe("example evaluation read-only guarantee", () => {
  it("is read by no API route, repository, worker, billing or analytics code", () => {
    const readers = ["app", "components", "lib", "services"]
      .flatMap(files)
      .filter((path) => !path.startsWith("lib/evals/example/") && !path.endsWith(".test.ts") && imports(path))
      .map((path) => relative(root, join(root, path)));
    expect(readers.filter((path) => !READERS.has(path))).toEqual([]);
    expect(readers.some((path) => path.startsWith("app/api/"))).toBe(false);
  });

  it("lets routes read only its flags, which import nothing from the example", () => {
    // The exemption above holds only while the flags module stays environment-only.
    const flags = readFileSync(join(root, "lib/evals/example/flags.ts"), "utf8");
    expect([...flags.matchAll(/(?:from\s+|import\s*\(?)\s*["']([^"']+)["']/g)].map((match) => match[1])).toEqual(["server-only"]);
    // API routes that ask for the flag read nothing else of the example.
    const routes = files("app/api").filter((path) => exampleImports(path).length);
    for (const path of routes) expect(exampleImports(path).every((specifier) => FLAG_ONLY.test(specifier)), path).toBe(true);
    expect(routes).toContain("app/api/evals/v1/workspace/onboarding/route.ts");
  });

  it("uses identifiers that can never name a database row", () => {
    for (const locale of ["en", "es"] as const) {
      const bundle = exampleBundle(locale);
      const ids = bundle.runs.flatMap((run) => [
        run.run_id,
        run.report_revision_id,
        run.system.target_revision_id,
        run.scope.suite_version_id,
        ...run.results.flatMap((result) => [result.case_revision_id, result.observation_id, result.assessment_id, ...result.source_refs.map((ref) => ref.source_revision_id)]),
        ...run.findings.map((finding) => finding.id),
        ...run.improvements.map((improvement) => improvement.id),
      ]);
      for (const id of ids) {
        expect(id.startsWith("example-"), id).toBe(true);
        expect(z.uuid().safeParse(id).success, id).toBe(false);
      }
    }
  });

  it("keeps its flags server-side and default off", async () => {
    const { exampleEvaluationEnabled, sampleReportIndexed } = await import("@/lib/evals/example/flags");
    const saved = { enabled: process.env.EXAMPLE_EVALUATION_ENABLED, indexed: process.env.SAMPLE_REPORT_INDEXED };
    try {
      delete process.env.EXAMPLE_EVALUATION_ENABLED;
      process.env.SAMPLE_REPORT_INDEXED = "true";
      expect(exampleEvaluationEnabled()).toBe(false);
      expect(sampleReportIndexed()).toBe(false);
      process.env.EXAMPLE_EVALUATION_ENABLED = "true";
      expect(exampleEvaluationEnabled()).toBe(true);
      expect(sampleReportIndexed()).toBe(true);
    } finally {
      for (const [key, value] of [["EXAMPLE_EVALUATION_ENABLED", saved.enabled], ["SAMPLE_REPORT_INDEXED", saved.indexed]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    for (const path of files("components").concat(files("lib"))) expect(readFileSync(join(root, path), "utf8"), path).not.toMatch(/NEXT_PUBLIC_(EXAMPLE|SAMPLE_REPORT)/);
    expect(readFileSync(join(root, "scripts/set-app-credentials.sh"), "utf8")).toMatch(/EXAMPLE_EVALUATION_ENABLED[\s\S]*SAMPLE_REPORT_INDEXED|SAMPLE_REPORT_INDEXED[\s\S]*EXAMPLE_EVALUATION_ENABLED/);
  });
});
