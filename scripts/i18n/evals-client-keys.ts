/**
 * Which evaluation-app messages each page outside the signed-in app sends to
 * the browser (launch L-24c). Writes `lib/evals/messages/client-keys.ts`.
 *
 *   npm run i18n:evals-client-keys          # regenerate
 *   npm run i18n:evals-client-keys -- --check   # fail when it is out of date
 *
 * The signed-in app (`app/(evaluation)/(authenticated)`) gets every message in
 * the reader's language. The pages a person opens without an account (sign-in,
 * sign-up, password reset, invitations, unsubscribe, two-factor set-up, shared
 * reports and fix lists) and the root layout's own frame get only the keys
 * their components can show, found here by reading the code:
 *
 * - from each entry, imports are followed through the app's UI modules
 *   (`app/`, `components/`) until a `"use client"` module, and from there
 *   through everything it imports (the code the browser runs);
 * - every string literal in those modules that is a message key counts (keys
 *   in label tables and props such as `contextKey="invitations"` included);
 * - a template literal or a `"prefix" + x` concatenation counts every key that
 *   starts with its fixed head (`t(\`sheetProblem_${code}\`)`).
 *
 * `tests/i18n/evals-client-messages.test.ts` runs the check and renders each
 * of these pages with only its keys, in both languages; the image build runs
 * that test, so a page that reads a key this file does not list fails the build.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { messages } from "@/lib/evals/messages/en";

const ROOT = path.resolve(__dirname, "../..");
const OUTPUT = "lib/evals/messages/client-keys.ts";

/**
 * Entries, by the scope a page sends. `shell` is sent by the root layout to
 * every page; the others add their own keys on top. A page that renders the
 * signed-in shell for a signed-in person (invitations) sends every key then,
 * so the shell is excluded from its scope here.
 */
export const EVALS_CLIENT_ENTRIES = {
  shell: { files: ["app/(evaluation)/layout.tsx", "app/(evaluation)/error.tsx", "app/(evaluation)/loading.tsx"] },
  "workspace/sign-in": { files: ["app/(evaluation)/workspace/sign-in/page.tsx"] },
  "workspace/start": { files: ["app/(evaluation)/workspace/start/page.tsx"] },
  "workspace/signup": { files: ["app/(evaluation)/workspace/signup/page.tsx"] },
  "workspace/reset-password": { files: ["app/(evaluation)/workspace/reset-password/page.tsx"] },
  "workspace/invitations": { files: ["app/(evaluation)/workspace/invitations/page.tsx"], exclude: ["components/evals/shell.tsx"] },
  "workspace/unsubscribe": { files: ["app/(evaluation)/workspace/unsubscribe/page.tsx"] },
  "workspace/security": { files: ["app/(evaluation)/workspace/security/page.tsx"] },
  share: { files: ["app/(evaluation)/share/page.tsx"] },
  "share/fixes": { files: ["app/(evaluation)/share/fixes/page.tsx"] },
} as const satisfies Record<string, { files: readonly string[]; exclude?: readonly string[] }>;

const KEYS = new Set(Object.keys(messages));
const SORTED_KEYS = [...KEYS].sort();

const parsed = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  let source = parsed.get(file);
  if (!source) {
    source = ts.createSourceFile(file, readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    parsed.set(file, source);
  }
  return source;
}

/** A project file for an import specifier, or null for packages and assets. */
function resolve(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(from), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.tsx?$/.test(candidate) && existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

function isClientModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use client";
}

/** Value imports, re-exports and dynamic imports of a module (type-only ones are erased). */
function imports(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = !!clause && (clause.isTypeOnly || (!clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly) found.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Keys a module names: literals, and every key under a fixed template or concatenation head. */
function keysIn(source: ts.SourceFile, into: Set<string>) {
  const prefix = (head: string) => {
    if (!head) return;
    for (const key of SORTED_KEYS) if (key.startsWith(head)) into.add(key);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && KEYS.has(node.text)) into.add(node.text);
    else if (ts.isTemplateExpression(node)) prefix(node.head.text);
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isStringLiteral(node.left)) prefix(node.left.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
}

/** The keys an entry's browser code can show, and the modules they came from. */
export function entryKeys(entry: { files: readonly string[]; exclude?: readonly string[] }): { keys: Set<string>; modules: string[] } {
  const keys = new Set<string>();
  const seen = new Map<string, boolean>(); // file -> visited as client code
  const excluded = new Set(entry.exclude ?? []);
  const queue: Array<{ file: string; client: boolean }> = entry.files.map((file) => ({ file, client: false }));
  while (queue.length) {
    const { file, client: inherited } = queue.shift()!;
    if (excluded.has(file)) continue;
    const source = parse(file);
    const client = inherited || isClientModule(source);
    if (seen.has(file) && (seen.get(file) || !client)) continue;
    seen.set(file, client);
    // Server UI modules count too: they pass keys to client components as props.
    keysIn(source, keys);
    for (const specifier of imports(source)) {
      const target = resolve(file, specifier);
      if (!target || target === "lib/evals/messages/en.ts" || target === "lib/evals/messages/es.ts") continue;
      // On the server side, only the UI layer can lead to browser code.
      if (!client && !/^(app|components)\//.test(target)) continue;
      queue.push({ file: target, client });
    }
  }
  return { keys, modules: [...seen.keys()].sort() };
}

export function generate(): string {
  const shell = entryKeys(EVALS_CLIENT_ENTRIES.shell).keys;
  const lines = Object.entries(EVALS_CLIENT_ENTRIES).map(([scope, entry]) => {
    const own = [...entryKeys(entry).keys].filter((key) => scope === "shell" || !shell.has(key)).sort();
    return `  ${JSON.stringify(scope)}: [\n${own.map((key) => `    ${JSON.stringify(key)},`).join("\n")}\n  ],`;
  });
  return `// Generated by scripts/i18n/evals-client-keys.ts (launch L-24c). Do not edit:
// run \`npm run i18n:evals-client-keys\` after changing what these pages show.
import type { MessageKey } from "./en";

/**
 * The evaluation-app message keys each page outside the signed-in app sends
 * to the browser. \`shell\` (the root layout's frame) goes to every page; a
 * page's own list leaves out what \`shell\` already has. The signed-in app
 * sends every key (lib/evals/messages/client-messages.ts).
 */
export const EVALS_CLIENT_KEYS = {
${lines.join("\n")}
} as const satisfies Record<string, readonly MessageKey[]>;

export type EvalsClientScope = keyof typeof EVALS_CLIENT_KEYS;
`;
}

if (typeof require !== "undefined" && require.main === module) {
  const next = generate();
  const file = path.join(ROOT, OUTPUT);
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (current !== next) {
      console.error(`${OUTPUT} is out of date: run \`npm run i18n:evals-client-keys\`.`);
      process.exit(1);
    }
    console.log(`${OUTPUT} is up to date.`);
  } else {
    writeFileSync(file, next);
    console.log(`Wrote ${OUTPUT}.`);
  }
}
