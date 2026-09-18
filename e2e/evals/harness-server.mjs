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
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({
          path: a.path,
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          loader: "js",
          contents:
            a.path === "next/link"
              ? 'import React from "react"; export default function Link({children,...p}) { return React.createElement("a",p,children); }'
              : "export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({refresh(){},push(p){location.assign(p)}});",
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
const scoped = await readFile(root + "app/(evaluation)/evaluation.css", "utf8");
createServer((req, res) => {
  if (req.url?.startsWith("/api/evals/v1/workspace/summary")) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: { evaluations: [], systems: [], reports: [], entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true }, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false } }, meta: {} }));
  } else if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(result.outputFiles[0].text);
  } else if (req.url === "/app.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css + "\n" + scoped);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evaluation UI contract harness</title><link rel="stylesheet" href="/app.css"><body class="font-sans"><div id="root"></div><script src="/app.js"></script></html>',
    );
  }
}).listen(4187, "127.0.0.1");
