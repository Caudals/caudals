// Isolated UI contract harness. This deliberately does not test Next routing or server authorization.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const root = new URL("../../", import.meta.url).pathname;
const result = await build({
  entryPoints: [root + "e2e/evals/ui-harness.tsx"],
  bundle: true,
  write: false,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "next-test-stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(link|navigation|image)$/ }, (a) => ({
          path: a.path,
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          loader: "js",
          contents:
            a.path === "next/link"
              ? 'import React from "react"; export default function Link({children,...p}) { return React.createElement("a",p,children); }'
              : a.path === "next/image"
                ? 'import React from "react"; export default function Image({priority,...p}) { return React.createElement("img",p); }'
                : "export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({refresh(){},push(p){const next=new URL(p,location.href);const current=new URLSearchParams(location.search);for(const role of [\"editor\",\"owner\"])if(current.has(role))next.searchParams.set(role,\"\");location.assign(next.pathname+next.search)}});",
          resolveDir: root,
        }));
      },
    },
  ],
});
const css = await postcss([tailwind()]).process(
  await readFile(root + "app/globals.css", "utf8"),
  { from: root + "app/globals.css" },
);
const platform = await readFile(root + "packages/brand/platform.css", "utf8");
// The evaluation sheet @imports the platform system. This file is concatenated
// after the Tailwind output, where a bare @import is invalid and gets dropped,
// so inline it here instead of relying on the browser to resolve it.
const scoped =
  platform +
  "\n" +
  (await readFile(root + "app/(evaluation)/evaluation.css", "utf8")).replace(
    /^@import\s+["'][^"']*platform\.css["'];\s*$/m,
    "",
  );
createServer(async (req, res) => {
  if (req.url?.startsWith("/api/evals/v1/workspace/summary")) {
    res.setHeader("Content-Type", "application/json");
    const empty = process.env.HARNESS_FIXTURE !== "demo";
    res.end(JSON.stringify({ data: {
      evaluations: empty ? [] : [
        { id: "eval-1", title: "Support assistant — refunds", project_id: "proj-1", project_title: "Customer support", project_description: "Front-line support assistant", latest_source_id: "src-1", latest_source_revision_id: "srcrev-1", preparation_status: "ready", reason_code: null, selected_suite_version_id: "suite-1", commercial_cap: "500", currency: "EUR", latest_run_id: "run-1", latest_run_status: "running", latest_run_phase: "executing" },
        { id: "eval-2", title: "Onboarding bot — eligibility", project_id: "proj-2", project_title: "Onboarding", project_description: "Signup assistant", latest_source_id: null, latest_source_revision_id: null, preparation_status: "needs_review", reason_code: null, selected_suite_version_id: null, commercial_cap: "500", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null },
        { id: "eval-3", title: "Claims triage — policy limits", project_id: "proj-3", project_title: "Claims", project_description: "Claims triage agent", latest_source_id: "src-3", latest_source_revision_id: "srcrev-3", preparation_status: "ready", reason_code: null, selected_suite_version_id: "suite-3", commercial_cap: "500", currency: "EUR", latest_run_id: "run-3", latest_run_status: "completed", latest_run_phase: "scoring" },
        { id: "eval-4", title: "Internal KB assistant", project_id: "proj-4", project_title: "Knowledge base", project_description: "Internal assistant", latest_source_id: "src-4", latest_source_revision_id: "srcrev-4", preparation_status: "checking_connection", reason_code: null, selected_suite_version_id: null, commercial_cap: "500", currency: "EUR", latest_run_id: "run-4", latest_run_status: "failed", latest_run_phase: "connecting" }
      ],
      systems: empty ? [] : [
        { id: "sys-1", project_id: "proj-1", title: "Support assistant (production)", target_revision_id: "targetrev-1", document: { kind: "website" }, connection_status: "connected", runner_status: null, error_code: null },
        { id: "sys-2", project_id: "proj-2", title: "Onboarding bot API", target_revision_id: "targetrev-2", document: { kind: "openai_compatible" }, connection_status: "unsupported", runner_status: null, error_code: "TLS_HANDSHAKE" },
        { id: "sys-3", project_id: "proj-3", title: "Claims triage (private network)", target_revision_id: "targetrev-3", document: { kind: "private_runner" }, connection_status: null, runner_status: "pairing_required", error_code: null }
      ],
      reports: empty ? [] : [
        { id: "report-1", title: "Support assistant — March evaluation", current_revision_id: "reportrev-1", evaluation_id: "eval-1" },
        { id: "report-2", title: "Claims triage — baseline", current_revision_id: "reportrev-2", evaluation_id: "eval-3" }
      ],
      entitlement: { max_active_runs: 2, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website", "openai_compatible"], can_export: true, can_schedule: true },
      usage: { settled: "128.40", outstanding: "12.00" },
      preferences: { completion: true, required_input: true, failure: true, email: false }
    }, meta: {} }));
  } else if (req.url?.startsWith("/caudals-logo") || req.url?.startsWith("/caudals_logo")) {
    try {
      const filePath = root + "public" + req.url.split("?")[0];
      res.setHeader("Content-Type", filePath.endsWith(".svg") ? "image/svg+xml" : "image/png");
      res.end(await readFile(filePath));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  } else if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(result.outputFiles[0].text);
  } else if (req.url === "/app.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css + "\n" + scoped);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evaluation UI contract harness</title><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></html>',
    );
  }
}).listen(Number(process.env.HARNESS_PORT ?? 4187), "127.0.0.1");
